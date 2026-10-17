//! Render bounded timeline intervals: upper video covers lower; all linked and independent audio mixes.
use crate::{
    project::Project,
    rendering::{ffprobe_path, inspect, Metadata},
    transcription::{run_process, run_process_capture, Job},
};
use std::{
    collections::HashMap,
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};
fn strings(v: &[&str]) -> Vec<OsString> {
    v.iter().map(Into::into).collect()
}
pub fn assemble(
    job: &Arc<Job>,
    ffmpeg: &Path,
    media: &Path,
    dir: &Path,
    p: &Project,
    meta: &Metadata,
) -> Result<PathBuf, String> {
    let effective = crate::effects::effective_clips(p);
    let clips = &effective;
    if clips.is_empty() {
        return Err("Montaż jest pusty".into());
    }
    let mut audio = HashMap::new();
    audio.insert(media.to_string_lossy().into_owned(), meta.has_audio);
    for a in p
        .assets
        .iter()
        .filter(|a| clips.iter().any(|c| c.asset_id.as_ref() == Some(&a.id)))
    {
        job.check()?;
        if a.kind == "video" {
            let m = inspect(job, ffmpeg, Path::new(&a.path), dir)?;
            if clips
                .iter()
                .filter(|c| c.asset_id.as_ref() == Some(&a.id))
                .any(|c| c.source_out > m.duration + 0.05)
            {
                return Err(format!("Ujęcie wychodzi poza źródło: {}", a.name));
            }
            audio.insert(a.path.clone(), m.has_audio);
        } else {
            let capture = dir.join("audio-probe.json");
            let mut args = strings(&[
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-show_entries",
                "stream=codec_type:format=duration",
                "-of",
                "json",
            ]);
            args.push(a.path.clone().into());
            run_process_capture(
                job,
                &ffprobe_path(ffmpeg)?,
                &args,
                false,
                dir,
                Some(&capture),
            )?;
            let data = fs::read(&capture).map_err(|e| e.to_string())?;
            if data.len() > 65536 {
                return Err("Zbyt obszerny wynik FFprobe".into());
            }
            let v: serde_json::Value = serde_json::from_slice(&data).map_err(|e| e.to_string())?;
            let has = v["streams"]
                .as_array()
                .is_some_and(|s| s.iter().any(|s| s["codec_type"] == "audio"));
            let duration = v["format"]["duration"]
                .as_str()
                .and_then(|s| s.parse::<f64>().ok())
                .ok_or("Brak czasu audio")?;
            if !has
                || !duration.is_finite()
                || clips
                    .iter()
                    .filter(|c| c.asset_id.as_ref() == Some(&a.id))
                    .any(|c| c.source_out > duration + 0.05)
            {
                return Err(format!("Nieprawidłowe źródło audio: {}", a.name));
            }
            audio.insert(a.path.clone(), true);
        }
    }
    let mut bounds = vec![0.0];
    for c in clips {
        bounds.push(c.start);
        bounds.push(c.end());
    }
    bounds.sort_by(f64::total_cmp);
    bounds.dedup_by(|a, b| (*a - *b).abs() < 1e-7);
    let mut concat = String::from("ffconcat version 1.0\n");
    for (i, pair) in bounds.windows(2).enumerate() {
        job.check()?;
        let start = pair[0];
        let end = pair[1];
        let frames = ((end * 30.0).round() - (start * 30.0).round()) as u64;
        if frames == 0 {
            continue;
        }
        let duration = frames as f64 / 30.0;
        {
            let mut s = job.status.lock().unwrap();
            s.message = format!(
                "Składanie obrazu i miks audio: {} / {}",
                i + 1,
                bounds.len() - 1
            );
            s.progress = None;
        }
        let active: Vec<_> = clips
            .iter()
            .filter(|c| c.start < end - 1e-7 && c.end() > start + 1e-7)
            .collect();
        let top = active
            .iter()
            .filter(|c| c.kind == "video")
            .map(|c| c.track)
            .max();
        let transition =
            top.and_then(|track| crate::effects::active_transition(p, start + 1e-6, track));
        let visible = if let Some(t) = transition {
            vec![t.from_id.as_str(), t.to_id.as_str()]
        } else {
            active
                .iter()
                .filter(|c| c.kind == "video")
                .max_by_key(|c| c.track)
                .map(|c| vec![c.id.as_str()])
                .unwrap_or_default()
        };
        let mut args = strings(&[
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-filter_complex_threads",
            "1",
        ]);
        let mut input = 0;
        let mut video = std::collections::HashMap::new();
        let mut sound = Vec::new();
        let mut filter = String::new();
        for c in &active {
            let path = p.clip_path(c).ok_or("Brak źródła")?;
            let is_video = visible.contains(&c.id.as_str());
            let has_audio = audio.get(path).copied().unwrap_or(meta.has_audio) && c.volume > 0.0;
            if !is_video && !has_audio {
                continue;
            }
            let input_start = if is_video && transition.is_some() {
                let t = transition.unwrap();
                let to = clips.iter().find(|c| c.id == t.to_id).unwrap();
                to.start
            } else {
                start
            };
            let audio_offset = start - input_start;
            args.extend(strings(&[
                "-ss",
                &(c.source_in + input_start - c.start).max(0.0).to_string(),
                "-t",
                &(if is_video && transition.is_some() {
                    transition.unwrap().duration + 0.15
                } else {
                    end - start + 0.1
                })
                .to_string(),
                "-protocol_whitelist",
                "file,pipe",
                "-i",
            ]));
            args.push(path.into());
            if is_video {
                video.insert(c.id.clone(), input);
                filter.push_str(&format!("[{input}:v:0]setpts=PTS-STARTPTS,{}scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,settb=AVTB,tpad=stop_mode=clone:stop_duration=0.1,format=yuv420p[v{input}];",crate::effects::color_filter(c),meta.width,meta.height,meta.width,meta.height));
            }
            if has_audio {
                let label = format!("a{input}");
                filter.push_str(&format!("[{input}:a:0]atrim=start={audio_offset},asetpts=PTS-STARTPTS,aresample=48000:async=1:first_pts=0,aformat=channel_layouts=stereo,volume='{}':eval=frame,apad,atrim=duration={duration}[{label}];",crate::effects::audio_gain(p,c,start)));
                sound.push(label);
            }
            input += 1;
        }
        if let Some(t) = transition {
            let av = *video.get(&t.from_id).ok_or("Brak początku przejścia")?;
            let bv = *video.get(&t.to_id).ok_or("Brak końca przejścia")?;
            let to = p
                .clips
                .as_deref()
                .unwrap()
                .iter()
                .find(|c| c.id == t.to_id)
                .unwrap();
            let offset = start - (to.start - t.duration);
            let d = t.duration;
            filter.push_str(&crate::effects::xfade_filter(
                &format!("v{av}"),
                &format!("v{bv}"),
                &t.kind,
                d,
                offset,
                duration,
            )?);
        } else if let Some(v) = visible.first().and_then(|id| video.get(*id)) {
            filter.push_str(&format!("[v{v}]null[v];"));
        } else {
            args.extend(strings(&[
                "-f",
                "lavfi",
                "-i",
                &format!(
                    "color=c=black:s={}x{}:r=30:d={duration}",
                    meta.width, meta.height
                ),
            ]));
            filter.push_str(&format!("[{input}:v:0]null[v];"));
            input += 1;
        }
        if sound.is_empty() {
            args.extend(strings(&[
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=48000:cl=stereo",
            ]));
            filter.push_str(&format!("[{input}:a:0]atrim=duration={duration}[a]"));
        } else {
            for s in &sound {
                filter.push_str(&format!("[{s}]"));
            }
            filter.push_str(&format!("amix=inputs={}:normalize=0:duration=longest,alimiter=limit=0.95:level=0:latency=1,atrim=duration={duration}[a]",sound.len()));
        }
        let name = format!("piece-{i:04}.mp4");
        args.extend(strings(&[
            "-filter_complex",
            &filter,
            "-map",
            "[v]",
            "-map",
            "[a]",
            "-c:v",
            "libx264",
            "-crf",
            "16",
            "-preset",
            "fast",
            "-pix_fmt",
            "yuv420p",
            "-video_track_timescale",
            "90000",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-map_metadata",
            "-1",
            "-t",
            &duration.to_string(),
            "-frames:v",
            &frames.to_string(),
            "-progress",
            "pipe:2",
            "-nostats",
            &name,
        ]));
        run_process(job, ffmpeg, &args, false, dir)?;
        concat.push_str(&format!("file '{name}'\nduration {duration:.9}\n"));
    }
    fs::write(dir.join("assembly.ffconcat"), concat).map_err(|e| e.to_string())?;
    run_process(
        job,
        ffmpeg,
        &strings(&[
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-protocol_whitelist",
            "file,pipe",
            "-f",
            "concat",
            "-safe",
            "1",
            "-i",
            "assembly.ffconcat",
            "-c",
            "copy",
            "-map_metadata",
            "-1",
            "assembled.mp4",
        ]),
        false,
        dir,
    )?;
    Ok(dir.join("assembled.mp4"))
}
