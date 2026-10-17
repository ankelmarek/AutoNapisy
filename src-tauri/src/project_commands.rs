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
use tauri::State;
#[derive(Default)]
pub struct ProjectState {
    session: Mutex<Session>,
    busy: AtomicBool,
}
struct Operation<'a>(&'a AtomicBool);
impl Drop for Operation<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl ProjectState {
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
