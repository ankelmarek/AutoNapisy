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
