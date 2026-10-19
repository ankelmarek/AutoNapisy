use crate::{
    commands::ToolState,
    smart_cut::{self, Analysis},
    transcription::{validate_tool, Job},
    Access,
};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
};
use tauri::{Manager, State};
#[derive(Default)]
pub struct SmartCutState {
    inner: Arc<Mutex<VecDeque<Entry>>>,
    visual: Arc<Mutex<VecDeque<Entry>>>,
    visual_gate: Arc<Mutex<()>>,
}
struct Entry {
    key: String,
    job: Arc<Job>,
    fingerprint: Option<String>,
    cancelled: bool,
}
impl SmartCutState {
    pub fn shutdown(&self) {
        for queue in [&self.inner, &self.visual] {
            for e in queue.lock().unwrap().iter() {
                e.job.cancel();
            }
        }
    }
}
fn valid_key(key: &str) -> Result<(), String> {
    if key.len() < 16
        || key.len() > 64
        || !key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("Nieprawidłowa sesja SmartCut".into());
    }
    Ok(())
}
fn ffmpeg(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let state = app.state::<ToolState>();
    let t = state.0.lock().map_err(|_| "Błąd narzędzi")?;
    validate_tool(
        "ffmpeg",
        t.ffmpeg.as_deref().ok_or("Wskaż FFmpeg w ustawieniach")?,
    )
}
#[tauri::command]
pub async fn analyze_smartcut(
    json: String,
    key: String,
    clip_id: String,
    other_id: Option<String>,
    from: f64,
    to: f64,
    app: tauri::AppHandle,
) -> Result<Analysis, String> {
    valid_key(&key)?;
    let p = crate::mlt_commands::authorized(&json, &app.state::<Access>())?;
    let tool = ffmpeg(&app)?;
    let state = app.state::<SmartCutState>().inner.clone();
    let job = Arc::new(Job::new(0));
    {
        let mut entries = state.lock().map_err(|_| "Błąd SmartCut")?;
        if entries.iter().any(|e| e.key == key) {
            return Err("Ta analiza została już użyta lub anulowana".into());
        }
        for e in entries.iter_mut() {
            if e.job.active() {
                e.cancelled = true;
                e.job.cancel();
            }
        }
        entries.push_back(Entry {
            key: key.clone(),
            job: job.clone(),
            fingerprint: None,
            cancelled: false,
        });
        while entries.len() > 32 {
            entries.pop_front();
        }
    }
    tauri::async_runtime::spawn_blocking(move || {
        let result: Result<Analysis, String> = (|| {
            job.check()?;
            let fingerprint = smart_cut::fingerprint(&p, &tool)?;
            let result = smart_cut::analyze(
                &job,
                &tool,
                &p,
                &clip_id,
                other_id.as_deref(),
                from,
                to,
                key.clone(),
            )?;
            job.check()?;
            if smart_cut::fingerprint(&p, &tool)? != fingerprint {
                return Err("Źródła zmieniły się podczas analizy. Uruchom ją ponownie.".into());
            }
            let mut entries = state.lock().map_err(|_| "Błąd SmartCut")?;
            let entry = entries
                .iter_mut()
                .find(|e| e.key == key)
                .ok_or("Analiza utraciła ważność")?;
            job.check()?;
            if entry.cancelled {
                return Err("Analiza została anulowana".into());
            }
            entry.fingerprint = Some(fingerprint);
            Ok(result)
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
#[tauri::command]
pub fn cancel_smartcut(key: String, state: State<'_, SmartCutState>) -> Result<(), String> {
    valid_key(&key)?;
    for queue in [&state.inner, &state.visual] {
        let mut entries = queue.lock().map_err(|_| "Błąd SmartCut")?;
        if let Some(e) = entries.iter_mut().find(|e| e.key == key) {
            e.cancelled = true;
            e.job.cancel();
        } else {
            let job = Arc::new(Job::new(0));
            job.cancel();
            entries.push_back(Entry {
                key: key.clone(),
                job,
                fingerprint: None,
                cancelled: true,
            });
            while entries.len() > 32 {
                entries.pop_front();
            }
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn validate_smartcut(
    key: String,
    json: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    valid_key(&key)?;
    let p = crate::mlt_commands::authorized(&json, &app.state::<Access>())?;
    let tool = ffmpeg(&app)?;
    let inner = app.state::<SmartCutState>().inner.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let entries = inner.lock().map_err(|_| "Błąd SmartCut")?;
        let e = entries
            .iter()
            .find(|e| e.key == key)
            .ok_or("Uruchom analizę ponownie")?;
        e.job.check()?;
        if e.cancelled {
            return Err("Analiza została anulowana".into());
        }
        let basis = e
            .fingerprint
            .as_ref()
            .ok_or("Analiza nie jest zakończona")?;
        if &smart_cut::fingerprint(&p, &tool)? != basis {
            return Err(
                "Projekt, źródła lub narzędzia zmieniły się. Uruchom analizę ponownie.".into(),
            );
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn analyze_smartcut_visual(
    json: String,
    key: String,
    at: f64,
    app: tauri::AppHandle,
) -> Result<crate::smart_cut_visual::VisualAnalysis, String> {
    valid_key(&key)?;
    let p = crate::mlt_commands::authorized(&json, &app.state::<Access>())?;
    let tool = ffmpeg(&app)?;
    let melt = app.state::<crate::mlt_commands::MltState>().path()?;
    let queue = app.state::<SmartCutState>().visual.clone();
    let gate = app.state::<SmartCutState>().visual_gate.clone();
    let job = Arc::new(Job::new(0));
    {
        let mut entries = queue.lock().map_err(|_| "Błąd SmartCut")?;
        if entries.iter().any(|e| e.key == key) {
            return Err("Ta analiza została już użyta lub anulowana".into());
        }
        for e in entries.iter_mut().filter(|e| e.job.active()) {
            e.cancelled = true;
            e.job.cancel();
        }
        entries.push_back(Entry {
            key: key.clone(),
            job: job.clone(),
            fingerprint: None,
            cancelled: false,
        });
        while entries.len() > 32 {
            entries.pop_front();
        }
    }
    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let _guard = gate.lock().map_err(|_| "Błąd kolejki obrazu SmartCut")?;
            job.check()?;
            let basis = crate::smart_cut_visual::fingerprint(&p, &tool, &melt)?;
            let result = crate::smart_cut_visual::analyze(&job, &melt, &tool, &p, at, key.clone())?;
            job.check()?;
            if crate::smart_cut_visual::fingerprint(&p, &tool, &melt)? != basis {
                return Err("Źródła zmieniły się podczas porównania. Ponów analizę.".into());
            }
            let mut entries = queue.lock().map_err(|_| "Błąd SmartCut")?;
            let e = entries
                .iter_mut()
                .find(|e| e.key == key)
                .ok_or("Analiza utraciła ważność")?;
            job.check()?;
            if e.cancelled {
                return Err("Analiza została anulowana".into());
            }
            e.fingerprint = Some(basis);
            Ok(result)
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

#[tauri::command]
pub async fn validate_smartcut_visual(
    json: String,
    key: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    valid_key(&key)?;
    let p = crate::mlt_commands::authorized(&json, &app.state::<Access>())?;
    let tool = ffmpeg(&app)?;
    let melt = app.state::<crate::mlt_commands::MltState>().path()?;
    let queue = app.state::<SmartCutState>().visual.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let entries = queue.lock().map_err(|_| "Błąd SmartCut")?;
        let e = entries
            .iter()
            .find(|e| e.key == key)
            .ok_or("Ponów porównanie obrazu")?;
        e.job.check()?;
        if e.cancelled {
            return Err("Analiza została anulowana".into());
        }
        let basis = e
            .fingerprint
            .as_ref()
            .ok_or("Porównanie nie jest zakończone")?;
        if &crate::smart_cut_visual::fingerprint(&p, &tool, &melt)? != basis {
            return Err("Projekt, źródła lub narzędzia zmieniły się. Ponów porównanie.".into());
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
