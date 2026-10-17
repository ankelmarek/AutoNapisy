//! Build only audible timeline intervals; omitted source ranges and empty gaps never reach Whisper.
use crate::{
    project::{Project, Segment},
    rendering::ffprobe_path,
    transcription::{run_process, run_process_capture, Job},
};
use std::{collections::HashMap, ffi::OsString, fs, path::Path, sync::Arc};
#[derive(Clone, Debug)]
pub struct AudioRange {
    pub audio_start: f64,
    pub timeline_start: f64,
    pub duration: f64,
}
fn args(v: &[&str]) -> Vec<OsString> {
    v.iter().map(Into::into).collect()
}
pub fn prepare(
    job: &Arc<Job>,
    ffmpeg: &Path,
    p: &Project,
    dir: &Path,
) -> Result<Vec<AudioRange>, String> {
    let clips = crate::effects::effective_clips(p);
    if clips.is_empty() {
        return Err("Dodaj film lub audio na oś czasu".into());
    }
    let mut audible = HashMap::new();
    for c in &clips {
        let path = p.clip_path(c).ok_or("Brak źródła")?;
        if audible.contains_key(path) {
            continue;
        }
        let capture = dir.join("probe-audio.json");
        let mut a = args(&[
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "json",
        ]);
        a.push(path.into());
        run_process_capture(job, &ffprobe_path(ffmpeg)?, &a, false, dir, Some(&capture))?;
        let raw = fs::read(&capture).map_err(|e| e.to_string())?;
        if raw.len() > 65536 {
            return Err("Zbyt obszerny wynik FFprobe".into());
        }
        let value: serde_json::Value = serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
        audible.insert(
            path.to_string(),
            value["streams"]
                .as_array()
                .is_some_and(|s| s.iter().any(|s| s["codec_type"] == "audio")),
        );
    }
    let mut bounds = vec![];
    for c in &clips {
        bounds.push(c.start);
        bounds.push(c.end());
    }
    bounds.sort_by(f64::total_cmp);
    bounds.dedup_by(|a, b| (*a - *b).abs() < 1e-7);
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer =
        hound::WavWriter::create(dir.join("audio.wav"), spec).map_err(|e| e.to_string())?;
    let mut ranges = vec![];
    let mut samples = 0u64;
    for (i, pair) in bounds.windows(2).enumerate() {
        job.check()?;
        let start = pair[0];
        let end = pair[1];
        let length = end - start;
        if length < 0.0001 {
            continue;
        }
        let active: Vec<_> = clips
            .iter()
            .filter(|c| {
                c.start < end - 1e-7
                    && c.end() > start + 1e-7
                    && c.volume > 0.0
                    && audible
                        .get(p.clip_path(c).unwrap())
                        .copied()
                        .unwrap_or(false)
            })
            .collect();
        if active.is_empty() {
            continue;
        }
        {
            let mut s = job.status.lock().unwrap();
            s.message = format!(
                "Przygotowanie dźwięku montażu: {} / {}",
                i + 1,
                bounds.len() - 1
            );
        }
        let mut a = args(&[
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-filter_complex_threads",
            "1",
        ]);
        let mut filter = String::new();
        for (n, c) in active.iter().enumerate() {
            a.extend(args(&[
                "-ss",
                &(c.source_in + start - c.start).max(0.0).to_string(),
                "-t",
                &length.to_string(),
                "-protocol_whitelist",
                "file,pipe",
                "-i",
            ]));
            a.push(p.clip_path(c).unwrap().into());
            filter.push_str(&format!("[{n}:a:0]asetpts=PTS-STARTPTS,aresample=16000:async=1:first_pts=0,aformat=channel_layouts=mono,volume='{}':eval=frame,apad,atrim=duration={length}[a{n}];",crate::effects::audio_gain(p,c,start)));
        }
        for n in 0..active.len() {
            filter.push_str(&format!("[a{n}]"));
        }
        filter.push_str(&format!("amix=inputs={}:normalize=0,alimiter=limit=0.95:level=0:latency=1,atrim=duration={length}[out]",active.len()));
        a.extend(args(&[
            "-filter_complex",
            &filter,
            "-map",
            "[out]",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            "-t",
            &length.to_string(),
        ]));
        let file = dir.join("piece.wav");
        a.push(file.clone().into_os_string());
        run_process(job, ffmpeg, &a, false, dir)?;
        let mut reader = hound::WavReader::open(&file).map_err(|e| e.to_string())?;
        let count = reader.duration() as u64;
        ranges.push(AudioRange {
            audio_start: samples as f64 / 16000.0,
            timeline_start: start,
            duration: count as f64 / 16000.0,
        });
        for (n, sample) in reader.samples::<i16>().enumerate() {
            if n % 16000 == 0 {
                job.check()?;
            }
            writer
                .write_sample(sample.map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        }
        samples += count;
    }
    writer.finalize().map_err(|e| e.to_string())?;
    if samples == 0 {
        return Err("Na osi czasu nie ma słyszalnego dźwięku do rozpoznania".into());
    }
    Ok(ranges)
}
fn mapped(ranges: &[AudioRange], time: f64, end: bool) -> f64 {
    let range = ranges
        .iter()
        .find(|r| {
            time >= r.audio_start - 1e-6
                && if end {
                    time <= r.audio_start + r.duration + 1e-6
                } else {
                    time < r.audio_start + r.duration - 1e-6
                }
        })
        .or_else(|| ranges.last())
        .unwrap();
    range.timeline_start + (time - range.audio_start).clamp(0.0, range.duration)
}
pub fn remap(mut segments: Vec<Segment>, ranges: &[AudioRange]) -> Vec<Segment> {
    if ranges.is_empty() {
        return vec![];
    }
    for s in &mut segments {
        s.start = mapped(ranges, s.start, false);
        s.end = mapped(ranges, s.end, true);
        for w in &mut s.words {
            w.start = mapped(ranges, w.start, false);
            w.end = mapped(ranges, w.end, true);
        }
    }
    segments
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn maps_trimmed_audio_back_over_timeline_gaps() {
        let r = vec![
            AudioRange {
                audio_start: 0.,
                timeline_start: 5.,
                duration: 2.,
            },
            AudioRange {
                audio_start: 2.,
                timeline_start: 10.,
                duration: 3.,
            },
        ];
        assert_eq!(mapped(&r, 2., false), 10.);
        assert_eq!(mapped(&r, 2., true), 7.);
        assert_eq!(mapped(&r, 3., false), 11.);
    }
}
/// Plan frame-aligned audible ranges for the shared MLT timeline, excluding unused library assets.
pub fn plan(
    job: &Arc<Job>,
    ffmpeg: &Path,
    p: &Project,
    dir: &Path,
) -> Result<Vec<AudioRange>, String> {
    let clips = crate::effects::effective_clips(p);
    let mut audible = HashMap::new();
    let mut intervals = vec![];
    for c in &clips {
        if c.volume <= 0.0 {
            continue;
        }
        let path = p.clip_path(c).ok_or("Brak źródła")?;
        if !audible.contains_key(path) {
            let capture = dir.join("probe-audio.json");
            let mut a = args(&[
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "json",
            ]);
            a.push(path.into());
            run_process_capture(job, &ffprobe_path(ffmpeg)?, &a, false, dir, Some(&capture))?;
            let raw = fs::read(&capture).map_err(|e| e.to_string())?;
            if raw.len() > 65536 {
                return Err("Zbyt obszerny wynik FFprobe".into());
            }
            let v: serde_json::Value = serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
            audible.insert(
                path.to_string(),
                v["streams"]
                    .as_array()
                    .is_some_and(|s| s.iter().any(|s| s["codec_type"] == "audio")),
            );
        }
        if audible[path] {
            let start = crate::mlt::frame(c.start);
            let end = crate::mlt::frame(c.end());
            if end > start {
                intervals.push((start, end));
            }
        }
    }
    intervals.sort_unstable();
    let mut merged: Vec<(i64, i64)> = vec![];
    for (a, b) in intervals {
        if let Some(last) = merged.last_mut() {
            if a <= last.1 {
                last.1 = last.1.max(b);
                continue;
            }
        }
        merged.push((a, b));
    }
    let mut offset = 0;
    let mut result = vec![];
    for (a, b) in merged {
        result.push(AudioRange {
            audio_start: offset as f64 / 30.,
            timeline_start: a as f64 / 30.,
            duration: (b - a) as f64 / 30.,
        });
        offset += b - a;
    }
    if result.is_empty() {
        return Err("Na osi nie ma słyszalnego dźwięku do rozpoznania".into());
    }
    Ok(result)
}
