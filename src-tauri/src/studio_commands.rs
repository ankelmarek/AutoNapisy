use crate::{
    commands::ToolState,
    export_studio::{self, Options, Profile, Queue},
    media_path, path_string,
    transcription::{self, Job},
    Access,
};
use base64::Engine;
use serde::Serialize;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Manager, State};
#[derive(Default)]
pub struct StudioState {
    pub queue: Arc<Queue>,
    folders: Mutex<HashMap<u64, PathBuf>>,
    ids: AtomicU64,
    preview: Mutex<Option<Arc<Job>>>,
    preview_gate: Arc<Mutex<()>>,
}
impl StudioState {
    pub fn shutdown(&self) {
        if let Some(job) = self.preview.lock().unwrap().as_ref() {
            job.cancel();
        }
        self.queue.shutdown();
    }
}
pub(crate) fn tools(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let state = app.state::<ToolState>();
    let t = state.0.lock().map_err(|_| "Błąd narzędzi")?;
    let ff = transcription::validate_tool("ffmpeg", t.ffmpeg.as_deref().ok_or("Wskaż FFmpeg")?)?;
    Ok((ff, app.state::<crate::mlt_commands::MltState>().path()?))
}
pub(crate) fn authorize(
    json: &str,
    app: &tauri::AppHandle,
) -> Result<crate::project::Project, String> {
    let mut p = crate::mlt_commands::authorized(json, &app.state::<Access>())?;
    let mut allowed = app
        .state::<Access>()
        .0
        .lock()
        .map_err(|_| "Błąd uprawnień")?
        .clone();
    for a in &mut p.assets {
        let path = media_path(Path::new(&a.path))?;
        if !allowed.contains(&path) {
            return Err("Najpierw otwórz projekt lub zaimportuj źródła".into());
        }
        a.path = path_string(&path)?;
    }
    if let Some(m) = &mut p.media {
        let path = media_path(Path::new(&m.path))?;
        if !allowed.remove(&path) {
            return Err("Brak uprawnień do filmu".into());
        }
        m.path = path_string(&path)?;
    }
    Ok(p)
}
#[derive(Serialize)]
pub struct Folder {
    id: u64,
    path: String,
}
#[tauri::command]
pub async fn studio_folder(state: State<'_, StudioState>) -> Result<Option<Folder>, String> {
    #[cfg(feature = "ui-tests")]
    let test = std::env::var_os("ROLVIXA_TEST_STUDIO_DIR").map(PathBuf::from);
    #[cfg(not(feature = "ui-tests"))]
    let test: Option<PathBuf> = None;
    let path = if let Some(p) = test {
        p
    } else {
        let Some(file) = rfd::AsyncFileDialog::new()
            .set_title("Folder eksportów")
            .pick_folder()
            .await
        else {
            return Ok(None);
        };
        file.path().to_owned()
    };
    let path = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !path.is_dir() {
        return Err("Wybierz katalog".into());
    }
    let mut map = state.folders.lock().map_err(|_| "Błąd folderów")?;
    if map.len() >= 32 {
        return Err("Zbyt wiele wybranych folderów w tej sesji".into());
    }
    let id = state.ids.fetch_add(1, Ordering::SeqCst) + 1;
    map.insert(id, path.clone());
    Ok(Some(Folder {
        id,
        path: path_string(&path)?,
    }))
}
#[derive(Serialize)]
pub struct Picked {
    projects: Vec<String>,
    errors: Vec<String>,
}
#[tauri::command]
pub async fn studio_projects(app: tauri::AppHandle) -> Result<Picked, String> {
    #[cfg(feature = "ui-tests")]
    let test = std::env::var_os("ROLVIXA_TEST_STUDIO_PROJECT").map(|p| vec![PathBuf::from(p)]);
    #[cfg(not(feature = "ui-tests"))]
    let test: Option<Vec<PathBuf>> = None;
    let paths = if let Some(p) = test {
        p
    } else {
        let Some(files) = rfd::AsyncFileDialog::new()
            .set_title("Projekty do eksportu")
            .add_filter("Projekt RolVixa", &["json"])
            .pick_files()
            .await
        else {
            return Ok(Picked {
                projects: vec![],
                errors: vec![],
            });
        };
        files.into_iter().map(|f| f.path().to_owned()).collect()
    };
    if paths.len() > 10 {
        return Err("Wybierz najwyżej 10 projektów".into());
    }
    let mut projects = vec![];
    let mut errors = vec![];
    for path in paths {
        let result = (|| {
            let text = crate::project_file::Target::selected(&path)?.read()?;
            let p = crate::project::parse(&text)?;
            let access = app.state::<Access>();
            let mut allowed = access.0.lock().map_err(|_| "Błąd uprawnień")?;
            for path in p
                .media
                .iter()
                .map(|m| m.path.as_str())
                .chain(p.assets.iter().map(|a| a.path.as_str()))
            {
                if let Ok(p) = media_path(Path::new(path)) {
                    allowed.insert(p);
                }
            }
            Ok::<_, String>(text)
        })();
        match result {
            Ok(text) => projects.push(text),
            Err(e) => errors.push(format!(
                "{}: {e}",
                path.file_name().unwrap_or_default().to_string_lossy()
            )),
        }
    }
    Ok(Picked { projects, errors })
}
fn registry(app: &tauri::AppHandle) -> Result<export_studio::Profiles, String> {
    let mut root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    #[cfg(feature = "ui-tests")]
    if let Some(test) = std::env::var_os("ROLVIXA_TEST_STUDIO_DIR") {
        root = PathBuf::from(test);
    }
    Ok(export_studio::Profiles(root.join("export-studio-v1")))
}
#[tauri::command]
pub fn studio_profiles(app: tauri::AppHandle) -> Result<Vec<Profile>, String> {
    registry(&app)?.list()
}
#[tauri::command]
pub fn studio_profile_update(
    profile: Option<Profile>,
    remove: Option<String>,
    app: tauri::AppHandle,
) -> Result<Vec<Profile>, String> {
    registry(&app)?.update(profile, remove.as_deref())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Prepared {
    id: u64,
    width: u32,
    height: u32,
    frames: usize,
    output_path: String,
}
#[tauri::command]
pub async fn studio_prepare(
    json: String,
    captions: String,
    options: Options,
    folder_id: u64,
    app: tauri::AppHandle,
) -> Result<Prepared, String> {
    let mut p = authorize(&json, &app)?;
    p.segments = crate::project::export_captions(&p, Some(&captions))?;
    let (ff, melt) = tools(&app)?;
    let state = app.state::<StudioState>();
    let folder = state
        .folders
        .lock()
        .map_err(|_| "Błąd folderu")?
        .get(&folder_id)
        .cloned()
        .ok_or("Wybierz folder w natywnym dialogu")?;
    let queue = state.queue.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let e = queue.prepare(p, options, &folder, ff, melt)?;
        let (w, h) = e.options.dimensions(&e.meta);
        Ok(Prepared {
            id: e.id,
            width: w,
            height: h,
            frames: if e.options.captions == "burn" {
                e.project.segments.len()
            } else {
                0
            },
            output_path: path_string(&e.target)?,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn studio_upload(
    id: u64,
    index: usize,
    png: String,
    state: State<'_, StudioState>,
) -> Result<(), String> {
    if png.len() > crate::rendering::MAX_PNG_BYTES * 4 / 3 + 8 {
        return Err("Plansza przekracza limit".into());
    }
    let e = state.queue.get(id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(png)
            .map_err(|e| e.to_string())?;
        e.upload(index, &bytes)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn studio_ready(id: u64, state: State<'_, StudioState>) -> Result<(), String> {
    state.queue.ready(id)
}
#[tauri::command]
pub fn studio_status(state: State<'_, StudioState>) -> Vec<export_studio::Item> {
    state.queue.list()
}
#[tauri::command]
pub fn studio_cancel(id: u64, state: State<'_, StudioState>) -> Result<(), String> {
    state.queue.cancel(id)
}
#[tauri::command]
pub fn studio_retry(id: u64, state: State<'_, StudioState>) -> Result<(), String> {
    state.queue.retry(id)
}
#[tauri::command]
pub fn studio_remove(id: u64, state: State<'_, StudioState>) -> Result<(), String> {
    state.queue.remove(id)
}
#[derive(Serialize)]
pub struct Preview {
    png: String,
    width: u32,
    height: u32,
}
#[tauri::command]
pub async fn studio_preview(
    json: String,
    options: Options,
    time: f64,
    app: tauri::AppHandle,
) -> Result<Preview, String> {
    let p = authorize(&json, &app)?;
    let (ff, melt) = tools(&app)?;
    let state = app.state::<StudioState>();
    let job = Arc::new(Job::new(0));
    if let Some(old) = state
        .preview
        .lock()
        .map_err(|_| "Błąd podglądu")?
        .replace(job.clone())
    {
        old.cancel();
    }
    let gate = state.preview_gate.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = gate.lock().map_err(|_| "Błąd kolejki podglądu")?;
        let (bytes, width, height) = export_studio::preview(&job, &ff, &melt, &p, &options, time)?;
        job.check()?;
        Ok(Preview {
            png: base64::engine::general_purpose::STANDARD.encode(bytes),
            width,
            height,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn studio_cancel_preview(state: State<'_, StudioState>) {
    if let Some(job) = state.preview.lock().unwrap().as_ref() {
        job.cancel();
    }
}
#[tauri::command]
pub fn studio_profiles_clear(app: tauri::AppHandle) -> Result<(), String> {
    registry(&app)?.clear()
}
