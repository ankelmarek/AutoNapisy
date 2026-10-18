use crate::{
    commands::ToolState,
    media_path,
    media_sources::{self, SourceInfo},
    path_string,
    proxy::{self, Stamp},
    transcription::{validate_tool, Job},
    Access,
};
use serde::Serialize;
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Manager, State};
#[derive(Clone)]
struct Pending {
    token: u64,
    source: Stamp,
    previous: Option<String>,
}
#[derive(Default)]
pub struct SourceState {
    pending: Mutex<Option<Pending>>,
    sequence: AtomicU64,
    busy: AtomicBool,
    jobs: Mutex<Vec<Arc<Job>>>,
}
struct Operation<'a>(&'a AtomicBool);
impl Drop for Operation<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl SourceState {
    fn operation(&self) -> Result<Operation<'_>, String> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "Trwa sprawdzanie źródeł".to_string())?;
        Ok(Operation(&self.busy))
    }
    fn job(&self) -> Arc<Job> {
        let j = Arc::new(Job::new(0));
        let mut jobs = self.jobs.lock().unwrap();
        jobs.retain(|j| j.active());
        jobs.push(j.clone());
        j
    }
    pub fn shutdown(&self) {
        for j in self.jobs.lock().unwrap().iter() {
            j.cancel();
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Replacement {
    token: u64,
    path: String,
    name: String,
    info: SourceInfo,
    original: Option<SourceInfo>,
}
fn ffmpeg(tools: &ToolState) -> Result<std::path::PathBuf, String> {
    let t = tools.0.lock().map_err(|_| "Błąd narzędzi")?;
    validate_tool(
        "ffmpeg",
        t.ffmpeg.as_deref().ok_or("Wskaż FFmpeg w ustawieniach")?,
    )
}
#[tauri::command]
pub async fn choose_source_replacement(
    json: String,
    id: String,
    app: tauri::AppHandle,
) -> Result<Option<Replacement>, String> {
    let state = app.state::<SourceState>();
    let _op = state.operation()?;
    if json.len() > crate::project_file::LIMIT {
        return Err("Projekt przekracza 16 MB".into());
    }
    let p = crate::project::parse(&json)?;
    let (old, kind) = if id == "primary" {
        (
            p.media.as_ref().ok_or("Brak źródła")?.path.clone(),
            "video".to_string(),
        )
    } else {
        let a = p
            .assets
            .iter()
            .find(|a| a.id == id)
            .ok_or("Nieznane źródło")?;
        (a.path.clone(), a.kind.clone())
    };
    #[cfg(feature = "ui-tests")]
    let fixture = std::env::var_os("ROLVIXA_TEST_REPLACEMENT").map(std::path::PathBuf::from);
    #[cfg(not(feature = "ui-tests"))]
    let fixture: Option<std::path::PathBuf> = None;
    let chosen = if let Some(f) = fixture {
        f
    } else {
        let dialog = rfd::AsyncFileDialog::new().set_title("Wybierz źródło zastępcze");
        let dialog = if kind == "video" {
            dialog.add_filter("Film", &["mp4", "mov", "mkv", "webm", "avi", "m4v"])
        } else {
            dialog.add_filter(
                "Audio",
                &[
                    "mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "mp4", "mkv", "webm",
                ],
            )
        };
        let Some(f) = dialog.pick_file().await else {
            return Ok(None);
        };
        f.path().to_owned()
    };
    let path = media_path(&chosen)?;
    let tool = ffmpeg(&app.state::<ToolState>())?;
    let original = media_path(Path::new(&old))
        .ok()
        .filter(|p| app.state::<Access>().0.lock().is_ok_and(|a| a.contains(p)));
    let previous = original.as_ref().and_then(|p| path_string(p).ok());
    let job = state.job();
    let j = job.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let before = proxy::stamp(&path)?;
        let info = media_sources::inspect(&j, &tool, &path)?;
        if (kind == "video" && (info.video_streams == 0 || info.width == 0 || info.height == 0))
            || (kind == "audio" && info.audio_streams == 0)
        {
            return Err("Plik nie zawiera wymaganego obrazu lub dźwięku".to_string());
        }
        let original = original.and_then(|p| media_sources::inspect(&j, &tool, &p).ok());
        if before != proxy::stamp(&path)? {
            return Err("Plik zmienił się podczas sprawdzania. Wybierz go ponownie.".into());
        }
        Ok((before, info, original))
    })
    .await
    .map_err(|e| e.to_string())?;
    job.status.lock().unwrap().state = if result.is_ok() {
        "completed"
    } else {
        "failed"
    }
    .into();
    let (stamp, info, original) = result?;
    let token = state.sequence.fetch_add(1, Ordering::Relaxed) + 1;
    let path = stamp.path.clone();
    let name = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Plik")
        .to_owned();
    *state.pending.lock().unwrap() = Some(Pending {
        token,
        source: stamp,
        previous,
    });
    Ok(Some(Replacement {
        token,
        path,
        name,
        info,
        original,
    }))
}
#[tauri::command]
pub async fn confirm_source_replacement(
    token: u64,
    app: tauri::AppHandle,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<SourceState>();
        let _op = state.operation()?;
        let pending = state
            .pending
            .lock()
            .unwrap()
            .as_ref()
            .filter(|p| p.token == token)
            .cloned()
            .ok_or("Wybierz ponownie źródło")?;
        let stamp = pending.source;
        let path = media_path(Path::new(&stamp.path))?;
        if proxy::stamp(&path)? != stamp {
            return Err("Wybrany plik zmienił się. Wybierz go ponownie.".into());
        }
        let proxies = app.state::<crate::proxy_commands::ProxyState>();
        proxies.invalidate(&stamp.path)?;
        if let Some(old) = pending.previous {
            if old != stamp.path {
                proxies.invalidate(&old)?;
            }
        }
        app.asset_protocol_scope()
            .allow_file(&path)
            .map_err(|e| e.to_string())?;
        app.state::<Access>()
            .0
            .lock()
            .map_err(|_| "Błąd uprawnień")?
            .insert(path.clone());
        *state.pending.lock().unwrap() = None;
        path_string(&path)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn discard_source_replacement(token: u64, state: State<'_, SourceState>) {
    let mut p = state.pending.lock().unwrap();
    if p.as_ref().is_some_and(|p| p.token == token) {
        *p = None;
    }
}
#[derive(Serialize)]
pub struct SourceCheck {
    id: String,
    available: bool,
    error: String,
    info: Option<SourceInfo>,
}
#[tauri::command]
pub async fn check_project_sources(
    json: String,
    app: tauri::AppHandle,
) -> Result<Vec<SourceCheck>, String> {
    if json.len() > crate::project_file::LIMIT {
        return Err("Projekt przekracza 16 MB".into());
    }
    let p = crate::project::parse(&json)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<SourceState>();
        let _op = state.operation()?;
        let job = state.job();
        let tool = ffmpeg(&app.state::<ToolState>());
        let mut checks = Vec::new();
        let mut items: Vec<_> = p
            .assets
            .iter()
            .map(|a| (a.id.clone(), a.path.clone()))
            .collect();
        if let Some(m) = &p.media {
            items.insert(0, ("primary".into(), m.path.clone()));
        }
        for (id, path) in items {
            job.check()?;
            let resolved = media_path(Path::new(&path)).and_then(|p| {
                if !app
                    .state::<Access>()
                    .0
                    .lock()
                    .map_err(|_| "Błąd uprawnień")?
                    .contains(&p)
                {
                    return Err("Brak dostępu. Wskaż plik ponownie.".into());
                }
                Ok(p)
            });
            let (available, error, info) = match resolved {
                Err(e) => (false, e, None),
                Ok(path) => {
                    // Only media used by the montage needs decoding validation for export.
                    if crate::effects::effective_clips(&p).iter().any(|c| {
                        id == "primary" || c.asset_id.as_deref().unwrap_or("primary") == id
                    }) {
                        match tool
                            .as_ref()
                            .map_err(Clone::clone)
                            .and_then(|f| media_sources::inspect(&job, f, &path))
                        {
                            Ok(i) => (true, String::new(), Some(i)),
                            Err(e) => (true, e, None),
                        }
                    } else {
                        (true, String::new(), None)
                    }
                }
            };
            checks.push(SourceCheck {
                id,
                available,
                error,
                info,
            });
        }
        job.status.lock().unwrap().state = "completed".into();
        Ok(checks)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inspection_is_exclusive_and_unlocks() {
        let s = SourceState::default();
        let guard = s.operation().unwrap();
        assert!(s.operation().is_err());
        drop(guard);
        assert!(s.operation().is_ok());
    }
}
