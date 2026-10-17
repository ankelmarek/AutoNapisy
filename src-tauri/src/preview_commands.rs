use crate::{
    commands::ToolState,
    media_path, path_string,
    transcription::{validate_tool, Job},
    Access,
};
use std::{
    collections::HashMap,
    hash::{Hash, Hasher},
    path::Path,
    sync::{Arc, Mutex},
};
use tauri::{Manager, State};
#[derive(Default)]
pub struct PreviewState {
    inner: Arc<Inner>,
}
#[derive(Default)]
struct Inner {
    gate: Mutex<()>,
    cache: Mutex<HashMap<u64, tempfile::TempDir>>,
    jobs: Mutex<Vec<Arc<Job>>>,
}
impl PreviewState {
    pub fn shutdown(&self) {
        for job in self.inner.jobs.lock().unwrap().iter() {
            job.cancel();
        }
    }
}
#[tauri::command]
pub async fn prepare_transition_preview(
    json: String,
    id: String,
    app: tauri::AppHandle,
    access: State<'_, Access>,
    tools: State<'_, ToolState>,
    state: State<'_, PreviewState>,
) -> Result<String, String> {
    if json.len() > 16 * 1024 * 1024 {
        return Err("Zbyt obszerny projekt".into());
    }
    let p = crate::project::parse(&json)?;
    let t = p
        .transitions
        .iter()
        .find(|t| t.id == id)
        .cloned()
        .ok_or("Brak przejścia")?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    serde_json::to_string(&t)
        .map_err(|e| e.to_string())?
        .hash(&mut hasher);
    for c in p
        .clips
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter(|c| c.id == t.from_id || c.id == t.to_id)
    {
        serde_json::to_string(c)
            .map_err(|e| e.to_string())?
            .hash(&mut hasher);
        let path = media_path(Path::new(p.clip_path(c).ok_or("Brak źródła")?))?;
        if !access
            .0
            .lock()
            .map_err(|_| "Błąd uprawnień")?
            .contains(&path)
        {
            return Err("Najpierw zaimportuj film".into());
        }
        path.hash(&mut hasher);
        let m = std::fs::metadata(path).map_err(|e| e.to_string())?;
        m.len().hash(&mut hasher);
        m.modified().ok().hash(&mut hasher);
    }
    let primary = media_path(Path::new(&p.media.as_ref().ok_or("Brak filmu")?.path))?;
    if !access.0.lock().unwrap().contains(&primary) {
        return Err("Najpierw zaimportuj film".into());
    }
    p.media.as_ref().unwrap().path.hash(&mut hasher);
    let ffmpeg = {
        let settings = tools.0.lock().unwrap();
        validate_tool(
            "ffmpeg",
            settings
                .ffmpeg
                .as_deref()
                .ok_or("Wskaż FFmpeg w ustawieniach")?,
        )?
    };
    ffmpeg.hash(&mut hasher);
    let key = hasher.finish();
    let inner = state.inner.clone();
    let job = Arc::new(Job::new(0));
    {
        let mut jobs = inner.jobs.lock().unwrap();
        jobs.retain(|j| j.active());
        if jobs.len() >= 100 {
            return Err("Zbyt wiele podglądów".into());
        }
        jobs.push(job.clone());
    }
    let path = tauri::async_runtime::spawn_blocking(move || {
        let result: Result<std::path::PathBuf, String> = (|| {
            let _guard = inner.gate.lock().map_err(|_| "Błąd kolejki")?;
            job.check()?;
            let mut cache = inner.cache.lock().map_err(|_| "Błąd pamięci podglądu")?;
            if let Some(dir) = cache.get(&key) {
                return Ok(dir.path().join("transition.mp4"));
            }
            let dir = tempfile::Builder::new()
                .prefix("rolvixa-transition-")
                .tempdir()
                .map_err(|e| e.to_string())?;
            let path = crate::transition_preview::render(&job, &ffmpeg, &p, &t, dir.path())?;
            if cache.len() >= 256 {
                if let Some(old) = cache.keys().next().copied() {
                    cache.remove(&old);
                }
            }
            cache.insert(key, dir);
            Ok(path)
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
    .map_err(|e| e.to_string())??;
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|e| e.to_string())?;
    path_string(&path)
}
