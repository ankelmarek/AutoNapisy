use crate::{
    commands::ToolState,
    media_path,
    transcription::{validate_tool, Job},
    waveform::{self, Peaks},
    Access,
};
use std::{
    path::Path,
    sync::{Arc, Mutex},
};
use tauri::State;
#[derive(Default)]
pub struct AnalysisState {
    jobs: Arc<Mutex<Vec<Arc<Job>>>>,
    gate: Arc<Mutex<()>>,
}
impl AnalysisState {
    pub fn shutdown(&self) {
        for job in self.jobs.lock().unwrap().iter() {
            job.cancel();
        }
    }
}
#[tauri::command]
pub async fn audio_waveform(
    path: String,
    duration: f64,
    access: State<'_, Access>,
    tools: State<'_, ToolState>,
    analysis: State<'_, AnalysisState>,
) -> Result<Peaks, String> {
    let path = media_path(Path::new(&path))?;
    if !access
        .0
        .lock()
        .map_err(|_| "Błąd uprawnień")?
        .contains(&path)
    {
        return Err("Najpierw zaimportuj plik lub jego projekt".into());
    }
    if !duration.is_finite() || !(0.05..=86400.0).contains(&duration) {
        return Err("Nieprawidłowy czas".into());
    }
    let ffmpeg = {
        let settings = tools.0.lock().unwrap();
        validate_tool("ffmpeg", settings.ffmpeg.as_deref().ok_or("Wskaż FFmpeg")?)?
    };
    let job = Arc::new(Job::new(0));
    {
        let mut jobs = analysis.jobs.lock().unwrap();
        jobs.retain(|j| j.active());
        if jobs.len() >= 100 {
            return Err("Zbyt wiele analiz audio".into());
        }
        jobs.push(job.clone());
    }
    let gate = analysis.gate.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = gate.lock().map_err(|_| "Błąd kolejki audio")?;
        job.check()?;
        let result = waveform::analyze(&job, &ffmpeg, &path, duration);
        job.status.lock().unwrap().state = if result.is_ok() {
            "completed"
        } else {
            "failed"
        }
        .into();
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn media_info(
    path: String,
    kind: String,
    access: State<'_, Access>,
    tools: State<'_, ToolState>,
    analysis: State<'_, AnalysisState>,
) -> Result<crate::rendering::Metadata, String> {
    let path = media_path(Path::new(&path))?;
    if !access
        .0
        .lock()
        .map_err(|_| "Błąd uprawnień")?
        .contains(&path)
    {
        return Err("Najpierw zaimportuj plik".into());
    }
    if !["video", "audio"].contains(&kind.as_str()) {
        return Err("Nieprawidłowy rodzaj pliku".into());
    }
    let ffmpeg = {
        let t = tools.0.lock().unwrap();
        validate_tool("ffmpeg", t.ffmpeg.as_deref().ok_or("Wskaż FFmpeg")?)?
    };
    let job = Arc::new(Job::new(0));
    {
        let mut jobs = analysis.jobs.lock().unwrap();
        jobs.retain(|j| j.active());
        jobs.push(job.clone());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
            if kind == "video" {
                return crate::rendering::inspect(&job, &ffmpeg, &path, dir.path());
            }
            let capture = dir.path().join("audio.json");
            let mut args: Vec<std::ffi::OsString> = [
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-show_entries",
                "format=duration:stream=codec_type",
                "-of",
                "json",
            ]
            .iter()
            .map(Into::into)
            .collect();
            args.push(path.into_os_string());
            crate::transcription::run_process_capture(
                &job,
                &crate::rendering::ffprobe_path(&ffmpeg)?,
                &args,
                false,
                dir.path(),
                Some(&capture),
            )?;
            let raw = std::fs::read(capture).map_err(|e| e.to_string())?;
            if raw.len() > 65536 {
                return Err("Zbyt obszerny wynik FFprobe".into());
            }
            let v: serde_json::Value = serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
            let duration = v["format"]["duration"]
                .as_str()
                .and_then(|s| s.parse::<f64>().ok())
                .ok_or("Brak czasu audio")?;
            if !duration.is_finite() || !(0.05..=86400.0).contains(&duration) {
                return Err("Nieprawidłowy czas audio".into());
            }
            Ok(crate::rendering::Metadata {
                width: 1280,
                height: 720,
                duration,
                has_audio: true,
            })
        })();
        job.status.lock().unwrap().state = if result.is_ok() {
            "completed"
        } else {
            "failed"
        }
        .into();
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
