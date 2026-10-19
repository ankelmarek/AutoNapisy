//! Actual composed picture and floating-point stereo analysis. Never analyzes proxies.
use crate::{
    mlt,
    project::Project,
    rendering::{self, Metadata},
    transcription::{self, Job},
};
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsString,
    fs,
    io::{BufRead, BufReader},
    path::Path,
    sync::Arc,
};
pub const TEMP_LIMIT: u64 = 1024 * 1024 * 1024;
const EVENTS: usize = 1000;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Interval {
    pub start: f64,
    pub end: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Meter {
    pub integrated_lufs: Option<f64>,
    pub true_peak_db: Option<f64>,
    pub peak_time: Option<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub key: String,
    pub width: u32,
    pub height: u32,
    pub duration: f64,
    pub raw: Meter,
    pub current: Meter,
    pub silence: Vec<Interval>,
    pub black: Vec<Interval>,
    pub peaks: Vec<Interval>,
    pub truncated: bool,
}
fn number(s: &str) -> Option<f64> {
    s.parse::<f64>().ok().filter(|n| n.is_finite())
}
fn frame_time(line: &str) -> Option<f64> {
    number(line.split("pts_time:").nth(1)?.trim())
}
fn lines(path: &Path) -> Result<Vec<String>, String> {
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > 16 * 1024 * 1024 {
        return Err("Wynik analizy przekracza limit 16 MiB".into());
    }
    BufReader::new(fs::File::open(path).map_err(|e| e.to_string())?)
        .lines()
        .map(|l| l.map_err(|e| e.to_string()))
        .collect()
}
pub fn parse_meter(text: &[String]) -> Result<Meter, String> {
    let (mut integrated, mut maximum, mut time, mut peak_time) = (None, 0.0f64, 0.0, None);
    let mut seen = false;
    for line in text {
        if let Some(t) = frame_time(line) {
            time = t;
        }
        if let Some(s) = line.strip_prefix("lavfi.r128.I=") {
            seen = true;
            integrated = number(s).filter(|n| *n > -69.9);
        }
        if let Some(s) = line.strip_prefix("lavfi.r128.true_peak=") {
            let value = number(s).ok_or("Nieprawidłowy pomiar szczytu")?;
            if value < 0. {
                return Err("Ujemny pomiar amplitudy".into());
            }
            maximum = maximum.max(value);
            if value >= 1.0 && peak_time.is_none() {
                peak_time = Some(time);
            }
        }
    }
    if !seen {
        return Err("Brak pomiaru EBU R128".into());
    }
    Ok(Meter {
        integrated_lufs: integrated,
        true_peak_db: (maximum > 0.).then(|| 20. * maximum.log10()),
        peak_time,
    })
}
fn push(out: &mut Vec<Interval>, start: f64, end: f64, truncated: &mut bool) {
    if !start.is_finite() || !end.is_finite() || end <= start {
        return;
    }
    if let Some(last) = out.last_mut() {
        if start <= last.end + 0.011 {
            last.end = last.end.max(end);
            return;
        }
    }
    if out.len() < EVENTS {
        out.push(Interval { start, end });
    } else {
        *truncated = true;
    }
}
pub fn parse_intervals(text: &[String], name: &str, duration: f64) -> (Vec<Interval>, bool) {
    let (mut out, mut active, mut truncated) = (Vec::new(), None, false);
    for line in text {
        if let Some(value) = line.strip_prefix(&format!("lavfi.{name}_start=")) {
            if let Some(n) = number(value) {
                active = Some(n.clamp(0., duration));
            }
        }
        if let Some(value) = line.strip_prefix(&format!("lavfi.{name}_end=")) {
            if let (Some(start), Some(end)) = (active.take(), number(value)) {
                push(&mut out, start, end.clamp(0., duration), &mut truncated);
            }
        }
    }
    if let Some(start) = active {
        push(&mut out, start, duration, &mut truncated);
    }
    (out, truncated)
}
pub fn parse_peaks(text: &[String], duration: f64) -> (Vec<Interval>, bool) {
    let (mut out, mut time, mut truncated) = (Vec::new(), 0., false);
    for line in text {
        if let Some(t) = frame_time(line) {
            time = t;
        }
        if let Some(s) = line.strip_prefix("lavfi.astats.Overall.Peak_level=") {
            if number(s).is_some_and(|v| v >= -0.01) {
                push(&mut out, time, (time + 0.1).min(duration), &mut truncated);
            }
        }
    }
    (out, truncated)
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizationPlan {
    pub gain_db: f64,
    pub predicted_lufs: f64,
    pub predicted_peak_db: f64,
    pub limited: bool,
}
pub fn normalization(raw: &Meter, target: f64) -> Result<NormalizationPlan, String> {
    if !target.is_finite() || !(-30.0..=-9.0).contains(&target) {
        return Err("Cel musi mieścić się od −30 do −9 LUFS".into());
    }
    let i = raw
        .integrated_lufs
        .ok_or("Brak stabilnego LUFS: cisza, zbyt cichy lub zbyt krótki materiał")?;
    let peak = raw.true_peak_db.ok_or("Brak pomiaru szczytów")?;
    let wanted = target - i;
    // 0.1 dB margin covers rounded FFmpeg metadata. AAC may change encoded peaks.
    let gain = wanted.min(-1.1 - peak).clamp(-60., 24.);
    if peak + gain > -1.0 {
        return Err(
            "Szczyty przekraczają zakres normalizacji. Zmniejsz poziom ścieżek i zmierz ponownie."
                .into(),
        );
    }
    Ok(NormalizationPlan {
        gain_db: gain,
        predicted_lufs: i + gain,
        predicted_peak_db: peak + gain,
        limited: (gain - wanted).abs() > 0.05,
    })
}
fn phase(job: &Arc<Job>, message: &str, duration: f64) {
    let mut s = job.status.lock().unwrap();
    s.message = message.into();
    s.progress = None;
    *job.progress_duration.lock().unwrap() = Some(duration);
}
pub fn render_analysis(
    job: &Arc<Job>,
    melt: &Path,
    ffmpeg: &Path,
    p: &Project,
    dir: &Path,
    limit: u64,
) -> Result<(Metadata, std::path::PathBuf), String> {
    let mut meta = if let Some(m) = &p.media {
        rendering::inspect(job, ffmpeg, Path::new(&m.path), dir)?
    } else {
        Metadata {
            width: 1280,
            height: 720,
            duration: crate::project::composition_duration(p),
            has_audio: true,
        }
    };
    crate::framing::apply_canvas(p, &mut meta);
    let original = meta.clone();
    let factor = (320. / meta.width.max(meta.height) as f64).min(1.);
    meta.width = ((meta.width as f64 * factor / 2.).round() as u32 * 2).max(2);
    meta.height = ((meta.height as f64 * factor / 2.).round() as u32 * 2).max(2);
    let mut raw = p.clone();
    raw.master_audio = Default::default();
    raw.canvas = Some(crate::project::Canvas {
        width: meta.width,
        height: meta.height,
    });
    phase(
        job,
        "Tworzenie obrazu i miksu do analizy · oryginały, stereo float",
        crate::project::composition_duration(p),
    );
    mlt::prepare(job, ffmpeg, &raw, &meta, dir, true)?;
    let args: Vec<OsString> = [
        "timeline.mlt".to_string(),
        "in=0".into(),
        format!(
            "out={}",
            mlt::frame(crate::project::composition_duration(p)) - 1
        ),
        "-consumer".into(),
        "avformat:quality.mkv".into(),
        "real_time=-2".into(),
        "terminate_on_pause=1".into(),
        "threads=2".into(),
        "f=matroska".into(),
        "vcodec=ffv1".into(),
        "pix_fmt=yuv420p".into(),
        "acodec=pcm_f32le".into(),
        "mlt_audio_format=f32le".into(),
        "sample_fmt=flt".into(),
        "ar=48000".into(),
        "ac=2".into(),
    ]
    .iter()
    .map(Into::into)
    .collect();
    let output = dir.join("quality.mkv");
    transcription::run_process_bounded(job,melt,&args,dir,&output,limit).map_err(|e|if e.contains("limit miejsca"){"Analiza przekroczyła limit pliku tymczasowego 1 GiB. Skróć montaż lub użyj raportu podstawowego.".into()}else{e})?;
    Ok((original, output))
}
pub fn measure(
    job: &Arc<Job>,
    ffmpeg: &Path,
    input: &Path,
    dir: &Path,
    duration: f64,
    gain_db: f64,
) -> Result<
    (
        Meter,
        Meter,
        Vec<Interval>,
        Vec<Interval>,
        Vec<Interval>,
        bool,
    ),
    String,
> {
    phase(
        job,
        "Pomiar LUFS i szczytów miksu przed normalizacją",
        duration,
    );
    let args: Vec<OsString> = [
        "-v",
        "error",
        "-nostdin",
        "-threads",
        "1",
        "-filter_threads",
        "1",
        "-progress",
        "pipe:2",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
    ]
    .iter()
    .map(Into::into)
    .chain(std::iter::once(input.into()))
    .chain(
        [
            "-map",
            "0:a:0",
            "-vn",
            "-af",
            "ebur128=peak=true:metadata=1,ametadata=mode=print:file=raw-meter.txt",
            "-f",
            "null",
            "-",
        ]
        .iter()
        .map(Into::into),
    )
    .collect();
    transcription::run_process(job, ffmpeg, &args, false, dir)?;
    let raw = parse_meter(&lines(&dir.join("raw-meter.txt"))?)?;
    job.check()?;
    phase(
        job,
        "Pomiar odsłuchu · LUFS, szczyty, cisza i czarny obraz",
        duration,
    );
    let graph=format!("[0:a:0]volume={gain_db}dB,asplit=3[m][s][p];[m]ebur128=peak=true:metadata=1,ametadata=mode=print:file=meter.txt[a];[s]silencedetect=n=-50dB:d=0.5,ametadata=mode=print:file=silence.txt[b];[p]asetnsamples=n=4800:p=0,astats=metadata=1:reset=1,ametadata=mode=print:key=lavfi.astats.Overall.Peak_level:file=peaks.txt[c];[0:v:0]blackdetect=d=0.15:pix_th=0.10:pic_th=0.98,metadata=mode=print:file=black.txt[v]");
    let args: Vec<OsString> = [
        "-v",
        "error",
        "-nostdin",
        "-threads",
        "1",
        "-filter_complex_threads",
        "1",
        "-progress",
        "pipe:2",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
    ]
    .iter()
    .map(Into::into)
    .chain(std::iter::once(input.into()))
    .chain(
        [
            "-filter_complex",
            &graph,
            "-map",
            "[a]",
            "-map",
            "[b]",
            "-map",
            "[c]",
            "-map",
            "[v]",
            "-f",
            "null",
            "-",
        ]
        .iter()
        .map(Into::into),
    )
    .collect();
    transcription::run_process(job, ffmpeg, &args, false, dir)?;
    job.check()?;
    let current = parse_meter(&lines(&dir.join("meter.txt"))?)?;
    let (silence, s) = parse_intervals(&lines(&dir.join("silence.txt"))?, "silence", duration);
    let (black, b) = parse_intervals(&lines(&dir.join("black.txt"))?, "black", duration);
    let (peaks, p) = parse_peaks(&lines(&dir.join("peaks.txt"))?, duration);
    Ok((raw, current, silence, black, peaks, s || b || p))
}
pub fn analyze(
    job: &Arc<Job>,
    melt: &Path,
    ffmpeg: &Path,
    p: &Project,
    dir: &Path,
    key: String,
) -> Result<Report, String> {
    let duration = mlt::frame(crate::project::composition_duration(p)) as f64 / 30.;
    if duration <= 0. {
        return Err("Montaż jest pusty".into());
    }
    let (meta, input) = render_analysis(job, melt, ffmpeg, p, dir, TEMP_LIMIT)?;
    let (raw, current, silence, black, peaks, truncated) =
        measure(job, ffmpeg, &input, dir, duration, p.master_audio.gain_db)?;
    Ok(Report {
        key,
        width: meta.width,
        height: meta.height,
        duration,
        raw,
        current,
        silence,
        black,
        peaks,
        truncated,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finite_lufs_and_silence() {
        let m = parse_meter(&[
            "lavfi.r128.I=-70.000".into(),
            "lavfi.r128.true_peak=0.000".into(),
        ])
        .unwrap();
        assert!(m.integrated_lufs.is_none());
        assert!(m.true_peak_db.is_none());
        assert!(normalization(&m, -14.).is_err());
        assert!(parse_meter(&[]).is_err());
    }
    #[test]
    fn intervals_close_at_end_and_merge() {
        let x = vec![
            "lavfi.silence_start=0.5".into(),
            "lavfi.silence_end=1".into(),
            "lavfi.silence_start=1.005".into(),
        ];
        let (v, t) = parse_intervals(&x, "silence", 2.);
        assert!(!t);
        assert_eq!(
            v,
            vec![Interval {
                start: 0.5,
                end: 2.
            }]
        );
    }
    #[test]
    fn target_and_peak_bound_are_honest() {
        let p = normalization(
            &Meter {
                integrated_lufs: Some(-24.),
                true_peak_db: Some(-3.),
                peak_time: None,
            },
            -14.,
        )
        .unwrap();
        assert!(p.limited);
        assert!((p.gain_db - 1.9).abs() < 1e-6);
        assert!((p.predicted_lufs + 22.1).abs() < 1e-6);
        assert!(p.predicted_peak_db <= -1.);
        assert!(normalization(
            &Meter {
                integrated_lufs: Some(-20.),
                true_peak_db: Some(-15.),
                peak_time: None
            },
            f64::NAN
        )
        .is_err());
    }
    #[test]
    fn peak_times_have_real_frame_precision() {
        let (v, _) = parse_peaks(
            &[
                "frame:0 pts:0 pts_time:0.4".into(),
                "lavfi.astats.Overall.Peak_level=1.5".into(),
                "frame:1 pts:4800 pts_time:0.5".into(),
                "lavfi.astats.Overall.Peak_level=0.0".into(),
            ],
            1.,
        );
        assert_eq!(
            v,
            vec![Interval {
                start: 0.4,
                end: 0.6
            }]
        );
    }
}

pub fn fingerprint(p: &Project, ffmpeg: &Path, melt: &Path) -> Result<String, String> {
    let clips = crate::effects::effective_clips(p);
    let mut paths: Vec<_> = clips
        .iter()
        .filter_map(|c| p.clip_path(c))
        .chain(p.media.iter().map(|m| m.path.as_str()))
        .collect();
    paths.sort_unstable();
    paths.dedup();
    let stamps: Vec<_> = paths
        .iter()
        .map(|p| crate::proxy::stamp(Path::new(p)))
        .collect::<Result<_, _>>()?;
    let mut tracks: Vec<_> = p
        .track_layout
        .iter()
        .map(|t| {
            let s = p.tracks.state(&t.id);
            (
                t.id.clone(),
                s.is_some_and(|s| s.muted),
                s.is_some_and(|s| s.hidden),
            )
        })
        .collect();
    tracks.sort_by(|a, b| a.0.cmp(&b.0));
    let assets: Vec<_> = p
        .assets
        .iter()
        .filter(|a| {
            clips
                .iter()
                .any(|c| c.asset_id.as_deref() == Some(a.id.as_str()))
        })
        .map(|a| (&a.id, &a.path, a.duration, &a.kind))
        .collect();
    let value = serde_json::json!({"analysisVersion":2,"videoOrder":p.track_layout.iter().filter(|t|t.kind=="video").map(|t|t.index).collect::<Vec<_>>(),"clips":p.clips,"primary":p.media.as_ref().map(|m|(&m.path,m.duration)),"assets":assets,"transitions":p.transitions,"canvas":p.canvas,"tracks":tracks,"gain":p.master_audio.gain_db,"sources":stamps,"ffmpeg":crate::proxy::stamp(ffmpeg)?,"melt":crate::proxy::stamp(melt)?});
    serde_json::to_string(&value).map_err(|e| e.to_string())
}
pub fn key_label(key: &str) -> String {
    let hash = key.bytes().fold(0xcbf29ce484222325u64, |h, b| {
        (h ^ u64::from(b)).wrapping_mul(0x100000001b3)
    });
    format!("{hash:016x}")
}
