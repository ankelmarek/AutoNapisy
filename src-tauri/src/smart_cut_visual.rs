//! Short, composed, original-source samples. A pixel heuristic, never a semantic quality score.
use crate::{
    mlt,
    project::Project,
    rendering,
    transcription::{self, Job},
};
use base64::Engine;
use serde::Serialize;
use std::{ffi::OsString, fs, path::Path, sync::Arc};

#[derive(Serialize)]
pub struct Still {
    pub time: f64,
    pub png: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualAnalysis {
    pub key: String,
    pub before: Still,
    pub after: Still,
    pub verdict: String,
    pub message: String,
    pub detail: String,
}
fn difference(a: &[u8], b: &[u8]) -> f64 {
    a.iter()
        .zip(b)
        .map(|(a, b)| (*a as f64 - *b as f64).abs())
        .sum::<f64>()
        / (a.len() as f64 * 255.)
}
pub fn assess(
    before: &[u8],
    after: &[u8],
    previous: Option<&[u8]>,
    next: Option<&[u8]>,
) -> Result<(&'static str, &'static str), String> {
    if before.is_empty()
        || before.len() != after.len()
        || previous.is_some_and(|p| p.len() != before.len())
        || next.is_some_and(|p| p.len() != before.len())
    {
        return Err("Niepełne klatki do porównania".into());
    }
    let cut = difference(before, after);
    let motion = previous
        .map(|p| difference(p, before))
        .unwrap_or(0.)
        .max(next.map(|n| difference(after, n)).unwrap_or(0.));
    Ok(if cut > 0.10 && cut > motion * 2. + 0.025 {
        (
            "jump",
            "Wyraźna zmiana obrazu na cięciu. Sprawdź pozycję, kadr i kolor.",
        )
    } else if motion > 0.06 {
        ("motion", "Obraz jest w ruchu. Oceń płynność w pętli.")
    } else if previous.is_none() || next.is_none() {
        (
            "limited",
            "Krótki zapas obrazu — porównanie ruchu jest ograniczone.",
        )
    } else {
        ("quiet", "W tej próbce nie wykryto wyraźnego skoku obrazu.")
    })
}
fn still(bytes: &[u8], width: u32, height: u32, time: f64) -> Result<Still, String> {
    let mut data = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut data, width, height);
        encoder.set_color(png::ColorType::Rgb);
        encoder.set_depth(png::BitDepth::Eight);
        encoder
            .write_header()
            .map_err(|e| e.to_string())?
            .write_image_data(bytes)
            .map_err(|e| e.to_string())?;
    }
    if data.len() > 512 * 1024 {
        return Err("Klatka porównania przekroczyła limit".into());
    }
    Ok(Still {
        time,
        png: base64::engine::general_purpose::STANDARD.encode(data),
    })
}
pub fn fingerprint(p: &Project, ffmpeg: &Path, melt: &Path) -> Result<String, String> {
    serde_json::to_string(&(
        crate::smart_cut::fingerprint(p, ffmpeg)?,
        crate::proxy::stamp(melt)?,
    ))
    .map_err(|e| e.to_string())
}
pub fn analyze(
    job: &Arc<Job>,
    melt: &Path,
    ffmpeg: &Path,
    p: &Project,
    at: f64,
    key: String,
) -> Result<VisualAnalysis, String> {
    let duration = crate::project::composition_duration(p);
    if !at.is_finite() || duration > 8. || at < 1. / 30. || at >= duration - 1e-6 {
        return Err("Porównanie wymaga krótkiego wycinka z obrazem po obu stronach granicy".into());
    }
    let join = mlt::frame(at);
    let last = (mlt::frame(duration) - 1).min(join + 1);
    if join < 1 || last < join {
        return Err("Brak klatki po obu stronach granicy".into());
    }
    let first = (join - 2).max(0);
    let count = (last - first + 1) as usize;
    let dir = tempfile::Builder::new()
        .prefix("rolvixa-cut-picture-")
        .tempdir()
        .map_err(|e| e.to_string())?;
    job.check()?;
    let mut meta = if let Some(m) = &p.media {
        rendering::inspect(job, ffmpeg, Path::new(&m.path), dir.path())?
    } else {
        rendering::Metadata {
            width: 1280,
            height: 720,
            duration,
            has_audio: false,
        }
    };
    crate::framing::apply_canvas(p, &mut meta);
    let factor = (320. / meta.width.max(meta.height) as f64).min(1.);
    meta.width = ((meta.width as f64 * factor / 2.).round() as u32 * 2).max(2);
    meta.height = ((meta.height as f64 * factor / 2.).round() as u32 * 2).max(2);
    let mut raw = p.clone();
    raw.canvas = Some(crate::project::Canvas {
        width: meta.width,
        height: meta.height,
    });
    mlt::prepare(job, ffmpeg, &raw, &meta, dir.path(), true)?;
    let args: Vec<OsString> = [
        "timeline.mlt".to_string(),
        format!("in={first}"),
        format!("out={last}"),
        "-consumer".into(),
        "avformat:frames.rgb".into(),
        "real_time=-2".into(),
        "terminate_on_pause=1".into(),
        "threads=1".into(),
        "f=rawvideo".into(),
        "vcodec=rawvideo".into(),
        "pix_fmt=rgb24".into(),
        "an=1".into(),
    ]
    .iter()
    .map(Into::into)
    .collect();
    let output = dir.path().join("frames.rgb");
    transcription::run_process_bounded(job, melt, &args, dir.path(), &output, 8 * 1024 * 1024)?;
    job.check()?;
    if fs::metadata(&output).map_err(|e| e.to_string())?.len() > 8 * 1024 * 1024 {
        return Err("Przekroczono limit porównania obrazu".into());
    }
    let data = fs::read(output).map_err(|e| e.to_string())?;
    let size = (meta.width * meta.height * 3) as usize;
    if data.len() != size * count {
        return Err("MLT nie zwrócił wszystkich klatek porównania".into());
    }
    let frames: Vec<_> = data.chunks_exact(size).collect();
    let left = (join - first - 1) as usize;
    let right = left + 1;
    let (verdict, message) = assess(
        frames[left],
        frames[right],
        left.checked_sub(1).map(|i| frames[i]),
        frames.get(right + 1).copied(),
    )?;
    Ok(VisualAnalysis {key,before:still(frames[left],meta.width,meta.height,(join-1) as f64/30.)?,after:still(frames[right],meta.width,meta.height,join as f64/30.)?,verdict:verdict.into(),message:message.into(),detail:"Porównano kolor i układ pikseli z ruchem w sąsiednich klatkach. To wskazówka, nie ocena poprawności cięcia ani rozpoznawanie osoby. Obraz montażu bez napisów, do 320 px, 30 kl./s.".into()})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn static_and_deliberate_change_are_distinct() {
        let a = vec![0; 300];
        let b = vec![220; 300];
        assert_eq!(assess(&a, &a, Some(&a), Some(&a)).unwrap().0, "quiet");
        assert_eq!(assess(&a, &b, Some(&a), Some(&b)).unwrap().0, "jump");
    }
    #[test]
    fn ordinary_motion_is_not_called_a_jump() {
        assert_eq!(
            assess(&[70; 30], &[110; 30], Some(&[30; 30]), Some(&[150; 30]))
                .unwrap()
                .0,
            "motion"
        );
    }
    #[test]
    fn incomplete_samples_fail_without_a_result() {
        assert!(assess(&[], &[], None, None).is_err());
        assert!(assess(&[0; 3], &[0; 4], None, None).is_err());
        assert_eq!(assess(&[0; 3], &[0; 3], None, None).unwrap().0, "limited");
    }
}
