use crate::{
    export_studio::Options,
    smart_export::{Comparison, Sample, SampleRange},
    transcription::Job,
};
use base64::Engine;
use serde::Serialize;
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
};
use tauri::{Manager, State};
struct Session {
    key: String,
    job: Arc<Job>,
    sample: Option<Arc<Sample>>,
    cancelled: bool,
    started: bool,
}
#[derive(Default)]
pub struct SampleState {
    sessions: Arc<Mutex<VecDeque<Session>>>,
    gate: Arc<Mutex<()>>,
}
impl SampleState {
    pub fn shutdown(&self) {
        for s in self.sessions.lock().unwrap().iter_mut() {
            s.cancelled = true;
            s.job.cancel();
            s.sample.take();
        }
        let _wait = self.gate.lock().unwrap();
    }
    fn get(&self, key: &str) -> Result<(Arc<Sample>, Arc<Job>), String> {
        let rows = self.sessions.lock().map_err(|_| "Błąd sesji próbek")?;
        let s = rows
            .iter()
            .find(|s| s.key == key)
            .ok_or("Nieznana sesja próbek")?;
        if s.cancelled {
            return Err("Anulowano porównanie".into());
        }
        Ok((
            s.sample.clone().ok_or("Próbki nie są przygotowane")?,
            s.job.clone(),
        ))
    }
}
fn key_valid(key: &str) -> Result<(), String> {
    if key.len() < 16
        || key.len() > 64
        || !key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("Nieprawidłowa sesja porównania".into());
    }
    Ok(())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Prepared {
    width: u32,
    height: u32,
    frames: Vec<usize>,
    total_frames: usize,
    range: SampleRange,
}
#[tauri::command]
pub async fn studio_sample_begin(
    key: String,
    json: String,
    captions: String,
    options: Options,
    start: f64,
    duration: f64,
    app: tauri::AppHandle,
) -> Result<Prepared, String> {
    key_valid(&key)?;
    options.validate()?;
    let mut p = crate::studio_commands::authorize(&json, &app)?;
    p.segments = crate::project::export_captions(&p, Some(&captions))?;
    let (ff, melt) = crate::studio_commands::tools(&app)?;
    let state = app.state::<SampleState>();
    let job = Arc::new(Job::new(0));
    {
        let mut rows = state.sessions.lock().map_err(|_| "Błąd sesji próbek")?;
        if rows.iter().any(|s| s.key == key) {
            return Err("Sesja już użyta lub anulowana".into());
        }
        for s in rows.iter_mut() {
            s.cancelled = true;
            s.job.cancel();
            s.sample.take();
        }
        rows.push_back(Session {
            key: key.clone(),
            job: job.clone(),
            sample: None,
            cancelled: false,
            started: false,
        });
        while rows.len() > 32 {
            rows.pop_front();
        }
    }
    let sessions = state.sessions.clone();
    let gate = state.gate.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = gate.lock().map_err(|_| "Błąd kolejki porównania")?;
        job.check()?;
        let sample = Arc::new(Sample::prepare(
            job.clone(),
            p,
            options,
            ff,
            melt,
            start,
            duration,
        )?);
        job.check()?;
        let (width, height) = sample.entry.options.dimensions(&sample.entry.meta);
        let result = Prepared {
            width,
            height,
            frames: sample.frames.clone(),
            total_frames: sample.entry.project.segments.len(),
            range: sample.range,
        };
        let mut rows = sessions.lock().map_err(|_| "Błąd sesji próbek")?;
        let s = rows
            .iter_mut()
            .find(|s| s.key == key)
            .ok_or("Nieaktualne porównanie")?;
        if s.cancelled {
            return Err("Anulowano porównanie".into());
        }
        s.sample = Some(sample);
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn studio_sample_upload(
    key: String,
    index: usize,
    png: String,
    state: State<'_, SampleState>,
) -> Result<(), String> {
    if png.len() > crate::rendering::MAX_PNG_BYTES * 4 / 3 + 8 {
        return Err("Za duża plansza".into());
    }
    let (sample, _) = state.get(&key)?;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(png)
            .map_err(|e| e.to_string())?;
        sample.entry.upload(index, &bytes)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[derive(Serialize)]
pub struct Ready {
    comparison: Comparison,
    paths: Vec<String>,
}
#[tauri::command]
pub async fn studio_sample_run(key: String, app: tauri::AppHandle) -> Result<Ready, String> {
    let state = app.state::<SampleState>();
    let (sample, job) = state.get(&key)?;
    {
        let mut rows = state.sessions.lock().map_err(|_| "Błąd sesji próbek")?;
        let s = rows
            .iter_mut()
            .find(|s| s.key == key)
            .ok_or("Nieaktualne porównanie")?;
        if s.started || s.cancelled {
            return Err("Sesja już uruchomiona lub anulowana".into());
        }
        s.started = true;
    }
    let gate = state.gate.clone();
    let sessions = state.sessions.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result: Result<Ready, String> = (|| {
            let _guard = gate.lock().map_err(|_| "Błąd kolejki porównania")?;
            job.check()?;
            let comparison = sample.run()?;
            let rows = sessions.lock().map_err(|_| "Błąd sesji próbek")?;
            if !rows.iter().any(|s| s.key == key && !s.cancelled) {
                return Err("Anulowano porównanie".into());
            }
            let mut paths = Vec::new();
            for v in &comparison.measurements {
                let path = sample.path(v.index)?;
                app.asset_protocol_scope()
                    .allow_file(&path)
                    .map_err(|e| e.to_string())?;
                paths.push(crate::path_string(&path)?);
            }
            Ok(Ready { comparison, paths })
        })();
        if let Err(ref error) = result {
            let mut s = job.status.lock().unwrap();
            s.state = if job.cancel.load(std::sync::atomic::Ordering::SeqCst) {
                "cancelled"
            } else {
                "failed"
            }
            .into();
            s.message = error.clone();
            s.progress = None;
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[derive(Serialize)]
pub struct Progress {
    state: String,
    message: String,
    progress: Option<u8>,
}
#[tauri::command]
pub fn studio_sample_status(
    key: String,
    state: State<'_, SampleState>,
) -> Result<Progress, String> {
    let rows = state.sessions.lock().map_err(|_| "Błąd sesji próbek")?;
    let s = rows
        .iter()
        .find(|s| s.key == key)
        .ok_or("Nieznana sesja próbek")?;
    let job = s.job.status.lock().unwrap();
    Ok(Progress {
        state: job.state.clone(),
        message: job.message.clone(),
        progress: job.progress,
    })
}
#[tauri::command]
pub fn studio_sample_cancel(key: String, state: State<'_, SampleState>) -> Result<(), String> {
    key_valid(&key)?;
    let mut rows = state.sessions.lock().map_err(|_| "Błąd sesji próbek")?;
    if let Some(s) = rows.iter_mut().find(|s| s.key == key) {
        s.cancelled = true;
        s.job.cancel();
        s.sample.take();
    } else {
        let job = Arc::new(Job::new(0));
        job.cancel();
        rows.push_back(Session {
            key,
            job,
            sample: None,
            cancelled: true,
            started: false,
        });
        while rows.len() > 32 {
            rows.pop_front();
        }
    }
    Ok(())
}
