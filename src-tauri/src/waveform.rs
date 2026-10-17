use crate::transcription::{run_process, Job};
use serde::Serialize;
use std::{fs, path::Path, sync::Arc};
#[derive(Clone, Serialize)]
pub struct Peaks {
    pub step: f64,
    pub peaks: Vec<f32>,
}
pub fn parse_peaks(data: &str, step: f64) -> Result<Peaks, String> {
    if data.len() > 2 * 1024 * 1024 {
        return Err("Zbyt obszerny przebieg audio".into());
    }
    let mut peaks = Vec::new();
    for line in data.lines() {
        if let Some(value) = line.strip_prefix("lavfi.astats.Overall.Peak_level=") {
            let db = value
                .parse::<f32>()
                .map_err(|_| "Nieprawidłowy poziom audio")?;
            if db.is_nan() || db == f32::INFINITY {
                return Err("Nieprawidłowy poziom audio".into());
            }
            peaks.push(if db == f32::NEG_INFINITY {
                0.0
            } else {
                10f32.powf(db / 20.0).clamp(0.0, 1.0)
            });
            if peaks.len() > 4096 {
                return Err("Zbyt wiele punktów audio".into());
            }
        }
    }
    if peaks.is_empty() {
        return Err("Brak przebiegu audio".into());
    }
    Ok(Peaks { step, peaks })
}
pub fn analyze(job: &Arc<Job>, ffmpeg: &Path, path: &Path, duration: f64) -> Result<Peaks, String> {
    if !duration.is_finite() || !(0.05..=86400.0).contains(&duration) {
        return Err("Nieprawidłowy czas audio".into());
    }
    let dir = tempfile::Builder::new()
        .prefix("rolvixa-waveform-")
        .tempdir()
        .map_err(|e| e.to_string())?;
    let samples = (duration * 8000.0 / 2048.0).ceil().max(1.0) as u64;
    let graph=format!("aresample=8000:async=1:first_pts=0,aformat=channel_layouts=mono,asetnsamples=n={samples}:p=0,astats=metadata=1:reset=1,ametadata=mode=print:key=lavfi.astats.Overall.Peak_level:file=peaks.txt");
    let mut args: Vec<std::ffi::OsString> = [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-threads",
        "1",
        "-filter_threads",
        "1",
        "-t",
        &duration.to_string(),
        "-protocol_whitelist",
        "file,pipe",
        "-i",
    ]
    .iter()
    .map(Into::into)
    .collect();
    args.push(path.as_os_str().to_owned());
    args.extend(
        ["-map", "0:a:0", "-vn", "-af", &graph, "-f", "null", "-"]
            .iter()
            .map(std::ffi::OsString::from),
    );
    run_process(job, ffmpeg, &args, false, dir.path())?;
    let data = fs::read_to_string(dir.path().join("peaks.txt")).map_err(|e| e.to_string())?;
    parse_peaks(&data, samples as f64 / 8000.0)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn real_levels_and_silence() {
        let p = parse_peaks(
            "lavfi.astats.Overall.Peak_level=-6.0206\nlavfi.astats.Overall.Peak_level=-inf",
            0.1,
        )
        .unwrap();
        assert!((p.peaks[0] - 0.5).abs() < 0.001);
        assert_eq!(p.peaks[1], 0.0);
        assert!(parse_peaks("lavfi.astats.Overall.Peak_level=NaN", 0.1).is_err());
    }
}
