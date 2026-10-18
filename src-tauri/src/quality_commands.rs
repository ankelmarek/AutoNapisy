use crate::{
    commands::ToolState,
    mlt_commands::MltState,
    project::Project,
    quality::{self, NormalizationPlan, Report},
    transcription::{validate_tool, Job},
    Access,
};
use serde::Serialize;
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Manager, State};
#[derive(Default)]
pub struct QualityState {
    sequence: AtomicU64,
    current: Mutex<Option<Session>>,
    cache: Arc<Mutex<VecDeque<(String, Report)>>>,
    workers: Mutex<Vec<(Arc<Job>, std::thread::JoinHandle<()>)>>,
}
struct Session {
    id: u64,
    fingerprint: String,
    job: Arc<Job>,
    result: Arc<Mutex<Option<Report>>>,
    cached: bool,
}
impl QualityState {
    pub fn shutdown(&self) {
        let mut workers = self.workers.lock().unwrap();
        for (j, _) in workers.iter() {
            j.cancel();
        }
        for (_, worker) in workers.drain(..) {
            let _ = worker.join();
        }
    }
}
fn tools(app: &tauri::AppHandle) -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
    let state = app.state::<ToolState>();
    let t = state.0.lock().map_err(|_| "Błąd narzędzi")?;
    Ok((
        validate_tool("ffmpeg", t.ffmpeg.as_deref().ok_or("Wskaż FFmpeg")?)?,
        app.state::<MltState>().path()?,
    ))
}
#[tauri::command]
pub async fn start_quality_analysis(json: String, app: tauri::AppHandle) -> Result<u64, String> {
    let p = crate::mlt_commands::authorized(&json, &app.state::<Access>())?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<QualityState>();
        let mut slot = state.current.lock().map_err(|_| "Błąd analizy")?;
        if slot.as_ref().is_some_and(|s| s.job.active()) {
            return Err("Trwa już analiza. Anuluj ją lub poczekaj.".into());
        }
        let (ffmpeg, melt) = tools(&app)?;
        let key = quality::fingerprint(&p, &ffmpeg, &melt)?;
        let id = state.sequence.fetch_add(1, Ordering::Relaxed) + 1;
        let job = Arc::new(Job::new(id));
        let saved = state
            .cache
            .lock()
            .unwrap()
            .iter()
            .find(|(k, _)| k == &key)
            .map(|(_, r)| r.clone());
        let cached = saved.is_some();
        let result = Arc::new(Mutex::new(saved));
        if cached {
            let mut s = job.status.lock().unwrap();
            s.state = "completed".into();
            s.message = "Aktualny wynik z pamięci analizy".into();
            s.progress = Some(100);
        }
        *slot = Some(Session {
            id,
            fingerprint: key.clone(),
            job: job.clone(),
            result: result.clone(),
            cached,
        });
        drop(slot);
        if !cached {
            let running = job.clone();
            let cache = state.cache.clone();
            let worker = std::thread::Builder::new()
                .name("rolvixa-quality".into())
                .spawn(move || {
                    let outcome = (|| {
                        let dir = tempfile::Builder::new()
                            .prefix("rolvixa-quality-")
                            .tempdir()
                            .map_err(|e| e.to_string())?;
                        let report = quality::analyze(
                            &running,
                            &melt,
                            &ffmpeg,
                            &p,
                            dir.path(),
                            quality::key_label(&key),
                        )?;
                        running.check()?;
                        if quality::fingerprint(&p, &ffmpeg, &melt)? != key {
                            return Err(
                                "Źródła zmieniły się podczas analizy. Uruchom ją ponownie.".into(),
                            );
                        }
                        Ok(report)
                    })();
                    let mut status = running.status.lock().unwrap();
                    if running.cancel.load(Ordering::SeqCst) {
                        status.state = "cancelled".into();
                        status.message = "Anulowano analizę".into();
                        status.progress = None;
                        return;
                    }
                    match outcome {
                        Ok(report) => {
                            let mut cache = cache.lock().unwrap();
                            cache.retain(|(k, _)| k != &key);
                            cache.push_front((key, report.clone()));
                            cache.truncate(4);
                            *result.lock().unwrap() = Some(report);
                            status.state = "completed".into();
                            status.message = "Analiza zakończona".into();
                            status.progress = Some(100);
                        }
                        Err(e) => {
                            status.state = "failed".into();
                            status.message = e;
                            status.progress = None;
                        }
                    }
                })
                .map_err(|e| {
                    job.status.lock().unwrap().state = "failed".into();
                    e.to_string()
                })?;
            let mut workers = state.workers.lock().unwrap();
            let mut i = 0;
            while i < workers.len() {
                if workers[i].1.is_finished() {
                    let (_, w) = workers.swap_remove(i);
                    let _ = w.join();
                } else {
                    i += 1;
                }
            }
            workers.push((job, worker));
        }
        Ok(id)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisStatus {
    id: u64,
    state: String,
    message: String,
    progress: Option<u8>,
    report: Option<Report>,
    cached: bool,
}
#[tauri::command]
pub fn quality_analysis_status(
    id: u64,
    state: State<'_, QualityState>,
) -> Result<AnalysisStatus, String> {
    let current = state.current.lock().map_err(|_| "Błąd analizy")?;
    let s = current
        .as_ref()
        .filter(|s| s.id == id)
        .ok_or("Nie ma takiej analizy")?;
    let status = s.job.status.lock().unwrap().clone();
    let report = if status.state == "completed" {
        s.result.lock().unwrap().clone()
    } else {
        None
    };
    Ok(AnalysisStatus {
        id,
        state: status.state,
        message: status.message,
        progress: status.progress,
        report,
        cached: s.cached,
    })
}
#[tauri::command]
pub fn cancel_quality_analysis(id: u64, state: State<'_, QualityState>) -> Result<(), String> {
    let current = state.current.lock().map_err(|_| "Błąd analizy")?;
    if let Some(s) = current.as_ref().filter(|s| s.id == id) {
        s.job.cancel();
    }
    Ok(())
}
#[tauri::command]
pub async fn plan_normalization(
    id: u64,
    json: String,
    target: f64,
    app: tauri::AppHandle,
) -> Result<NormalizationPlan, String> {
    let p: Project = crate::mlt_commands::authorized(&json, &app.state::<Access>())?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<QualityState>();
        let (measured_key, report) = state
            .current
            .lock()
            .map_err(|_| "Błąd analizy")?
            .as_ref()
            .filter(|s| s.id == id)
            .and_then(|s| {
                s.result
                    .lock()
                    .unwrap()
                    .clone()
                    .map(|r| (s.fingerprint.clone(), r))
            })
            .ok_or("Najpierw ukończ analizę miksu")?;
        let (ffmpeg, melt) = tools(&app)?;
        let key = quality::fingerprint(&p, &ffmpeg, &melt)?;
        // Label alone is insufficient: cache reuse and authorization compare the full fingerprint.
        if measured_key != key
            || !state
                .cache
                .lock()
                .unwrap()
                .iter()
                .any(|(k, r)| k == &key && r.key == report.key)
        {
            return Err("Montaż lub źródła zmieniły się. Przeanalizuj je ponownie.".into());
        }
        quality::normalization(&report.raw, target)
    })
    .await
    .map_err(|e| e.to_string())?
}
