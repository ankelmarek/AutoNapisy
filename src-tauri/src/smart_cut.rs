//! Bounded voice-edge measurements. No edits, network requests or whole-project render.
use crate::{
    project::{Clip, Project},
    transcription::{self, Job},
};
use serde::{Deserialize, Serialize};
use std::{ffi::OsString, path::Path, sync::Arc};
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Pause {
    pub start: f64,
    pub end: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Edge {
    pub boundary: f64,
    pub from: f64,
    pub to: f64,
    pub pauses: Vec<Pause>,
    pub available: bool,
    pub message: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct Analysis {
    pub key: String,
    pub edges: Vec<Edge>,
}
fn unavailable(boundary: f64, message: &str) -> Edge {
    Edge {
        boundary,
        from: boundary,
        to: boundary,
        pauses: vec![],
        available: false,
        message: message.into(),
    }
}
/// Ten-millisecond RMS windows; quiet runs must last at least 120 ms.
pub fn pauses(samples: &[f64], rate: u32, offset: f64) -> Vec<Pause> {
    let step = (rate / 100).max(1) as usize;
    let rms: Vec<_> = samples
        .chunks(step)
        .map(|s| (s.iter().map(|x| x * x).sum::<f64>() / s.len() as f64).sqrt())
        .collect();
    if rms.is_empty() {
        return vec![];
    }
    let mut levels = rms.clone();
    levels.sort_by(f64::total_cmp);
    let peak = levels[(levels.len() * 9 / 10).min(levels.len() - 1)];
    let threshold = (peak * 0.03).clamp(0.001, 0.0126);
    let mut out = vec![];
    let mut start = None;
    for i in 0..=rms.len() {
        if i < rms.len() && rms[i] <= threshold {
            start.get_or_insert(i);
        } else if let Some(s) = start.take() {
            let a = s as f64 * step as f64 / rate as f64;
            let b = (i * step).min(samples.len()) as f64 / rate as f64;
            if b - a >= 0.1199 {
                out.push(Pause {
                    start: offset + a,
                    end: offset + b,
                });
            }
        }
    }
    out
}
fn voice<'a>(p: &'a Project, picture: &'a Clip) -> Result<(&'a Clip, f64), String> {
    if !picture.audio_detached {
        return Ok((picture, 0.));
    }
    let group = picture
        .sync_group
        .as_deref()
        .ok_or("Obraz nie ma powiązanego dźwięku")?;
    let peers: Vec<_> = p
        .clips
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter(|c| c.kind == "audio" && c.sync_group.as_deref() == Some(group))
        .collect();
    if peers.len() != 1 {
        return Err("Powiązanie ma wiele fragmentów audio — ustaw granicę ręcznie".into());
    }
    let sound = peers[0];
    Ok((
        sound,
        sound.start - sound.source_in - (picture.start - picture.source_in),
    ))
}
fn edge(
    job: &Arc<Job>,
    ffmpeg: &Path,
    p: &Project,
    picture: &Clip,
    boundary: f64,
    dir: &Path,
    index: usize,
) -> Result<Edge, String> {
    let (sound, shift) = match voice(p, picture) {
        Ok(v) => v,
        Err(e) => return Ok(unavailable(boundary, &e)),
    };
    if p.tracks.audio_muted(sound) || sound.volume <= 0. {
        return Ok(unavailable(boundary, "Wybrany dźwięk jest wyciszony"));
    }
    let path = Path::new(p.clip_path(sound).ok_or("Brak źródła dźwięku")?);
    let meta = crate::rendering::inspect(job, ffmpeg, path, dir)?;
    if !meta.has_audio {
        return Ok(unavailable(boundary, "Źródło nie zawiera dźwięku"));
    }
    let source = sound.source_in + boundary + shift - sound.start;
    if source < 0. || source > meta.duration {
        return Ok(unavailable(
            boundary,
            "Granica wychodzi poza rzeczywistą długość źródła",
        ));
    }
    let begin = (source - 0.8).max(0.);
    let end = (source + 0.8).min(meta.duration);
    if end - begin < 0.12 {
        return Ok(unavailable(boundary, "Za krótki fragment do pomiaru pauzy"));
    }
    let out = dir.join(format!("edge-{index}.wav"));
    let mut args: Vec<OsString> = [
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-ss",
        &begin.to_string(),
        "-protocol_whitelist",
        "file,pipe",
        "-i",
    ]
    .iter()
    .map(Into::into)
    .collect();
    args.push(path.as_os_str().into());
    args.extend(
        [
            "-t",
            &(end - begin).to_string(),
            "-map",
            "0:a:0",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            "-threads",
            "1",
        ]
        .iter()
        .map(OsString::from),
    );
    args.push(out.clone().into());
    transcription::run_process(job, ffmpeg, &args, false, dir)?;
    job.check()?;
    if std::fs::metadata(&out).map_err(|e| e.to_string())?.len() > 256 * 1024 {
        return Err("Pomiar granicy przekroczył limit".into());
    }
    let mut reader = hound::WavReader::open(out).map_err(|e| e.to_string())?;
    let samples: Vec<f64> = reader
        .samples::<i16>()
        .map(|s| s.map(|v| v as f64 / 32768.).map_err(|e| e.to_string()))
        .collect::<Result<_, _>>()?;
    let offset = boundary - source + begin;
    Ok(Edge {
        boundary,
        from: offset,
        to: offset + samples.len() as f64 / 16000.,
        pauses: pauses(&samples, 16000, offset),
        available: true,
        message: "Pomiar dźwięku wybranego klipu; niezależna muzyka nie uczestniczy w analizie."
            .into(),
    })
}
pub fn analyze(
    job: &Arc<Job>,
    ffmpeg: &Path,
    p: &Project,
    id: &str,
    other: Option<&str>,
    from: f64,
    to: f64,
    key: String,
) -> Result<Analysis, String> {
    if !from.is_finite() || !to.is_finite() || from < 0. || to < from || to > 86400. {
        return Err("Nieprawidłowy zakres SmartCut".into());
    }
    let clips = p.clips.as_deref().unwrap_or(&[]);
    let first = clips
        .iter()
        .find(|c| c.id == id && c.kind == "video")
        .ok_or("Zaznacz film")?;
    let second = if let Some(id) = other {
        let b = clips
            .iter()
            .find(|c| c.id == id && c.kind == "video")
            .ok_or("Brak drugiego filmu")?;
        if b.track != first.track
            || (first.end() - b.start).abs() > 1e-6
            || (from - b.start).abs() > 0.81
            || (to - from).abs() > 1e-6
        {
            return Err("Wybierz rzeczywiste połączenie filmów".into());
        }
        b
    } else {
        if from < first.start - 1. / 30. || to > first.end() + 1. / 30. || to - from < 0.05 {
            return Err("Zakres musi mieścić się w jednym klipie".into());
        }
        first
    };
    let dir = tempfile::Builder::new()
        .prefix("rolvixa-smartcut-")
        .tempdir()
        .map_err(|e| e.to_string())?;
    let a = edge(job, ffmpeg, p, first, from, dir.path(), 0)?;
    job.check()?;
    let b = edge(job, ffmpeg, p, second, to, dir.path(), 1)?;
    Ok(Analysis {
        key,
        edges: vec![a, b],
    })
}
pub fn fingerprint(p: &Project, ffmpeg: &Path) -> Result<String, String> {
    let mut paths: Vec<_> = p
        .clips
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter_map(|c| p.clip_path(c))
        .collect();
    paths.sort_unstable();
    paths.dedup();
    let stamps = paths
        .iter()
        .map(|p| crate::proxy::stamp(Path::new(p)))
        .collect::<Result<Vec<_>, _>>()?;
    serde_json::to_string(&serde_json::json!({"project":serde_json::to_value(p).map_err(|e|e.to_string())?,"sources":stamps,"ffmpeg":crate::proxy::stamp(ffmpeg)?})).map_err(|e|e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn actual_runs_ignore_short_and_inside_speech() {
        let mut samples = vec![0.1; 16000];
        samples[3200..4000].fill(0.);
        samples[8000..11200].fill(0.);
        let p = pauses(&samples, 16000, 3.);
        assert_eq!(p.len(), 1);
        assert!((p[0].start - 3.5).abs() < 0.001);
        assert!((p[0].end - 3.7).abs() < 0.001);
    }
    #[test]
    fn empty_and_quiet_do_not_fabricate_speech() {
        assert!(pauses(&[], 16000, 0.).is_empty());
        let p = pauses(&vec![0.; 32000], 16000, 10.);
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].end, 12.);
        assert!(pauses(&vec![0.1; 32000], 16000, 0.).is_empty());
    }
    #[test]
    fn quiet_speech_uses_relative_threshold() {
        let mut s = vec![0.01; 16000];
        s[4000..8000].fill(0.0001);
        let p = pauses(&s, 16000, 0.);
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].start, 0.25);
    }
}
