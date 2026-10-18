use crate::{
    media_path, path_string,
    project_file::{Session, Target},
    Access,
};
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{Manager, State};
#[derive(Default)]
pub struct ProjectState {
    session: Mutex<Session>,
    busy: AtomicBool,
    recovery: Mutex<Option<Result<crate::recovery::Store, String>>>,
    pending_recovery: AtomicBool,
    manual_origin: Mutex<Option<String>>,
}
struct Operation<'a>(&'a AtomicBool);
impl Drop for Operation<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl ProjectState {
    fn store<R>(
        &self,
        app: &tauri::AppHandle,
        f: impl FnOnce(&crate::recovery::Store) -> Result<R, String>,
    ) -> Result<R, String> {
        let mut slot = self.recovery.lock().map_err(|_| "Błąd odzyskiwania")?;
        if slot.is_none() {
            let root = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?
                .join("recovery-v1");
            #[cfg(feature = "ui-tests")]
            let root = std::env::var_os("ROLVIXA_TEST_RECOVERY")
                .map(PathBuf::from)
                .unwrap_or(root);
            *slot = Some(crate::recovery::Store::open(root));
        }
        match slot.as_ref().unwrap() {
            Ok(store) => f(store),
            Err(e) => Err(e.clone()),
        }
    }
    fn retire(&self) -> Result<(), String> {
        let slot = self.recovery.lock().map_err(|_| "Błąd odzyskiwania")?;
        if let Some(Ok(store)) = slot.as_ref() {
            store.clear()?;
        }
        self.pending_recovery.store(false, Ordering::Release);
        *self.manual_origin.lock().map_err(|_| "Błąd sesji")? = None;
        Ok(())
    }
    fn operation(&self) -> Result<Operation<'_>, String> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "Trwa operacja na projekcie. Poczekaj na jej zakończenie.".to_owned())?;
        Ok(Operation(&self.busy))
    }
}
#[derive(Serialize)]
pub struct Opened {
    json: String,
    path: String,
    session: u64,
}
#[tauri::command]
pub fn new_project(state: State<'_, ProjectState>) -> Result<u64, String> {
    let _op = state.operation()?;
    state.retire()?;
    Ok(state
        .session
        .lock()
        .map_err(|_| "Błąd sesji projektu")?
        .reset(None))
}
#[tauri::command]
pub async fn open_project(
    state: State<'_, ProjectState>,
    access: State<'_, Access>,
) -> Result<Option<Opened>, String> {
    let _op = state.operation()?;
    let path = if let Some(path) = fixture() {
        path
    } else {
        let Some(f) = rfd::AsyncFileDialog::new()
            .add_filter("Projekt RolVixa", &["json"])
            .pick_file()
            .await
        else {
            return Ok(None);
        };
        f.path().to_path_buf()
    };
    let target = Target::selected(&path)?;
    let json = target.read()?;
    let p = crate::project::parse(&json)?;
    let path = path_string(target.path())?;
    for path in p
        .media
        .iter()
        .map(|m| m.path.as_str())
        .chain(p.assets.iter().map(|a| a.path.as_str()))
    {
        if let Ok(path) = media_path(std::path::Path::new(path)) {
            access.0.lock().map_err(|_| "Błąd uprawnień")?.insert(path);
        }
    }
    state.retire()?;
    let session = state
        .session
        .lock()
        .map_err(|_| "Błąd sesji projektu")?
        .reset(Some(target));
    Ok(Some(Opened {
        json,
        path,
        session,
    }))
}
fn fixture() -> Option<PathBuf> {
    #[cfg(feature = "ui-tests")]
    {
        std::env::var_os("ROLVIXA_TEST_PROJECT").map(PathBuf::from)
    }
    #[cfg(not(feature = "ui-tests"))]
    {
        None
    }
}
#[tauri::command]
pub async fn save_project(
    json: String,
    session: u64,
    save_as: bool,
    state: State<'_, ProjectState>,
) -> Result<Option<String>, String> {
    let _op = state.operation()?;
    if json.len() > crate::project_file::LIMIT {
        return Err("Projekt przekracza limit 16 MB".into());
    }
    let project = crate::project::parse(&json)?;
    let existing = {
        let s = state.session.lock().map_err(|_| "Błąd sesji projektu")?;
        s.check(session)?;
        s.target.clone()
    };
    let mut target = if !save_as && existing.is_some() {
        existing.unwrap()
    } else {
        let path = if let Some(path) = fixture() {
            if save_as {
                path.with_file_name(format!(
                    "{}-copy.json",
                    path.file_stem().unwrap().to_string_lossy()
                ))
            } else {
                path
            }
        } else {
            let Some(f) = rfd::AsyncFileDialog::new()
                .add_filter("Projekt RolVixa", &["json"])
                .set_file_name(crate::project_file::suggested_name(&project.name))
                .save_file()
                .await
            else {
                return Ok(None);
            };
            f.path().to_path_buf()
        };
        let chosen = Target::selected(&path)?;
        // Save As to the active file must retain conflict protection.
        existing
            .filter(|t| t.path() == chosen.path())
            .unwrap_or(chosen)
    };
    let path = path_string(target.path())?;
    target.write(&json)?;
    let mut s = state.session.lock().map_err(|_| "Błąd sesji projektu")?;
    s.check(session)?;
    s.target = Some(target);
    Ok(Some(path))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn operations_are_exclusive_and_release_after_error() {
        let s = ProjectState::default();
        let op = s.operation().unwrap();
        assert!(s.operation().is_err());
        drop(op);
        assert!(s.operation().is_ok());
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryStatus {
    recoverable: bool,
    session: u64,
    available: bool,
    name: String,
    captured_at: Option<u64>,
    manual_path: Option<String>,
    manual_at: Option<u64>,
    warning: String,
}
#[tauri::command]
pub async fn recovery_status(app: tauri::AppHandle) -> Result<RecoveryStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ProjectState>();

        let _op = state.operation()?;
        let session = state.session.lock().map_err(|_| "Błąd sesji")?.reset(None);
        let result = state.store(&app, |store| {
            let (snap, warning) = store.load();
            state
                .pending_recovery
                .store(snap.is_some() || !warning.is_empty(), Ordering::Release);
            Ok(RecoveryStatus {
                recoverable: snap.is_some(),
                session,
                available: snap.is_some() || !warning.is_empty(),
                name: snap
                    .as_ref()
                    .and_then(|s| s.project["name"].as_str())
                    .unwrap_or("")
                    .into(),
                captured_at: snap.as_ref().map(|s| s.captured_at),
                manual_path: snap.as_ref().and_then(|s| s.manual_path.clone()),
                manual_at: snap
                    .as_ref()
                    .and_then(|s| s.manual_path.as_ref())
                    .and_then(|p| {
                        std::fs::metadata(p)
                            .ok()?
                            .modified()
                            .ok()?
                            .duration_since(std::time::UNIX_EPOCH)
                            .ok()
                            .map(|t| t.as_millis() as u64)
                    }),
                warning,
            })
        });
        result.or_else(|e| {
            Ok(RecoveryStatus {
                recoverable: false,
                session,
                available: false,
                name: String::new(),
                captured_at: None,
                manual_path: None,
                manual_at: None,
                warning: e,
            })
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn write_recovery(
    json: String,
    session: u64,
    app: tauri::AppHandle,
) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ProjectState>();

        let _op = state.operation()?;
        if state.pending_recovery.load(Ordering::Acquire) {
            return Err("Najpierw wybierz sposób odzyskania poprzedniej sesji".into());
        }
        let s = state.session.lock().map_err(|_| "Błąd sesji projektu")?;
        s.check(session)?;
        let manual = s
            .target
            .as_ref()
            .map(|t| path_string(t.path()))
            .transpose()?
            .or(state
                .manual_origin
                .lock()
                .map_err(|_| "Błąd sesji")?
                .clone());
        let snap = crate::recovery::Snapshot::new(&json, manual)?;
        state.store(&app, |store| store.write(&snap))?;
        Ok(snap.captured_at)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn clear_recovery(session: u64, app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ProjectState>();

        let _op = state.operation()?;
        state
            .session
            .lock()
            .map_err(|_| "Błąd sesji projektu")?
            .check(session)?;
        if state.pending_recovery.load(Ordering::Acquire) {
            return Err("Najpierw wybierz sposób odzyskania".into());
        }
        state.store(&app, |store| store.clear())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn resolve_recovery(
    action: String,
    app: tauri::AppHandle,
) -> Result<Option<Opened>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ProjectState>();
        let access = app.state::<Access>();

        let _op = state.operation()?;
        if !state.pending_recovery.load(Ordering::Acquire) {
            return Err("Brak oczekującej kopii odzyskiwania".into());
        }
        if action == "discard" {
            state.store(&app, |store| store.clear())?;
            state.pending_recovery.store(false, Ordering::Release);
            return Ok(None);
        }
        let snap = state.store(&app, |store| {
            store
                .load()
                .0
                .ok_or("Brak poprawnej kopii odzyskiwania".to_string())
        })?;
        let (json, path, target) = match action.as_str() {
            "recover" => (snap.json()?, String::new(), None),
            "saved" => {
                let t = Target::selected(std::path::Path::new(
                    snap.manual_path
                        .as_deref()
                        .ok_or("Projekt nie był zapisany ręcznie")?,
                ))?;
                let json = t.read()?;
                let path = path_string(t.path())?;
                (json, path, Some(t))
            }
            _ => return Err("Nieznana operacja odzyskiwania".into()),
        };
        let p = crate::project::parse(&json)?;
        {
            let mut allowed = access.0.lock().map_err(|_| "Błąd uprawnień")?;
            for path in p
                .media
                .iter()
                .map(|m| m.path.as_str())
                .chain(p.assets.iter().map(|a| a.path.as_str()))
            {
                if let Ok(path) = media_path(std::path::Path::new(path)) {
                    allowed.insert(path);
                }
            }
        }
        if action == "saved" {
            state.store(&app, |store| store.clear())?;
        }
        let session = state
            .session
            .lock()
            .map_err(|_| "Błąd sesji projektu")?
            .reset(target);
        *state.manual_origin.lock().map_err(|_| "Błąd sesji")? = if action == "recover" {
            snap.manual_path
        } else {
            None
        };
        state.pending_recovery.store(false, Ordering::Release);
        Ok(Some(Opened {
            json,
            path,
            session,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}
