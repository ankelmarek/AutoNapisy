//! Bounded FFprobe metadata shared by source replacement and export checks.
use crate::transcription::{self, Job};
use serde::{Deserialize, Serialize};
use std::{ffi::OsString, io::Read, path::Path, sync::Arc};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub duration: f64,
    pub video_streams: usize,
    pub audio_streams: usize,
    pub width: u32,
    pub height: u32,
    pub rotation: f64,
    pub fps: Option<f64>,
    pub audio_channels: Option<u64>,
    pub sample_rate: Option<String>,
}
pub fn parse_info(raw: &str) -> Result<SourceInfo, String> {
    if raw.len() > 512 * 1024 {
        return Err("Zbyt obszerny opis źródła".into());
    }
    let v: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let streams = v["streams"].as_array().ok_or("Brak strumieni źródła")?;
    let video: Vec<_> = streams
        .iter()
        .filter(|s| s["codec_type"] == "video" && s["disposition"]["attached_pic"] != 1)
        .collect();
    let audio: Vec<_> = streams
        .iter()
        .filter(|s| s["codec_type"] == "audio")
        .collect();
    let number = |v: &serde_json::Value| {
        v.as_str()
            .and_then(|s| s.parse::<f64>().ok())
            .or_else(|| v.as_f64())
    };
    let duration = number(&v["format"]["duration"])
        .or_else(|| {
            streams
                .iter()
                .filter_map(|s| number(&s["duration"]))
                .reduce(f64::max)
        })
        .ok_or("Nieznany czas źródła")?;
    if !duration.is_finite()
        || !(0.05..=86400.).contains(&duration)
        || (video.is_empty() && audio.is_empty())
    {
        return Err("Nieprawidłowy czas lub brak obrazu i dźwięku".into());
    }
    let null = serde_json::Value::Null;
    let first = video.first().copied().unwrap_or(&null);
    let rotation = first["side_data_list"]
        .as_array()
        .and_then(|a| a.iter().find_map(|s| number(&s["rotation"])))
        .or_else(|| number(&first["tags"]["rotate"]))
        .unwrap_or(0.);
    let fps = first["avg_frame_rate"]
        .as_str()
        .and_then(|s| {
            let (a, b) = s.split_once('/')?;
            Some(a.parse::<f64>().ok()? / b.parse::<f64>().ok()?)
        })
        .filter(|f| f.is_finite() && *f > 0. && *f <= 1000.);
    Ok(SourceInfo {
        duration,
        video_streams: video.len(),
        audio_streams: audio.len(),
        width: first["width"].as_u64().unwrap_or(0).min(u32::MAX as u64) as u32,
        height: first["height"].as_u64().unwrap_or(0).min(u32::MAX as u64) as u32,
        rotation,
        fps,
        audio_channels: audio.first().and_then(|a| a["channels"].as_u64()),
        sample_rate: audio
            .first()
            .and_then(|a| a["sample_rate"].as_str())
            .map(str::to_owned),
    })
}
pub fn inspect(job: &Arc<Job>, ffmpeg: &Path, path: &Path) -> Result<SourceInfo, String> {
    let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let output = dir.path().join("source.json");
    let mut args: Vec<OsString> = [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
    ]
    .iter()
    .map(Into::into)
    .collect();
    args.push(path.into());
    transcription::run_process_capture(
        job,
        &crate::rendering::ffprobe_path(ffmpeg)?,
        &args,
        false,
        dir.path(),
        Some(&output),
    )?;
    let mut raw = String::new();
    std::fs::File::open(output)
        .map_err(|e| e.to_string())?
        .take(512 * 1024 + 1)
        .read_to_string(&mut raw)
        .map_err(|e| e.to_string())?;
    parse_info(&raw)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn audio_cover_is_not_video() {
        let m=parse_info(r#"{"format":{"duration":"12.5"},"streams":[{"codec_type":"video","disposition":{"attached_pic":1}},{"codec_type":"audio","channels":2,"sample_rate":"48000"}]}"#).unwrap();
        assert_eq!(m.video_streams, 0);
        assert_eq!(m.audio_streams, 1);
        assert_eq!(m.duration, 12.5);
        assert_eq!(m.audio_channels, Some(2));
    }
    #[test]
    fn video_rotation_and_rate() {
        let m=parse_info(r#"{"format":{"duration":"5"},"streams":[{"codec_type":"video","width":1920,"height":1080,"avg_frame_rate":"30000/1001","side_data_list":[{"rotation":-90}]},{"codec_type":"audio"}]}"#).unwrap();
        assert_eq!(m.rotation, -90.);
        assert!((m.fps.unwrap() - 29.97).abs() < 0.01);
        assert_eq!(m.width, 1920);
    }
    #[test]
    fn reject_unbounded_and_invalid_sources() {
        for raw in [
            r#"{"format":{"duration":"NaN"},"streams":[{"codec_type":"audio"}]}"#,
            r#"{"format":{"duration":"86401"},"streams":[{"codec_type":"audio"}]}"#,
            r#"{"format":{"duration":"5"},"streams":[]}"#,
        ] {
            assert!(parse_info(raw).is_err());
        }
        assert!(parse_info(&" ".repeat(512 * 1024 + 1)).is_err());
    }
}
