use crate::{
    media_path, path_string,
    transcription::{self, Job, Status, Tools},
    Access,
};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
};
use tauri::{Manager, State};
#[derive(Default)]
pub struct ToolState(pub Mutex<Tools>);
#[derive(Default)]
pub struct Tasks {
    pub(crate) current: Mutex<Option<Arc<Job>>>,
    pub(crate) worker: Mutex<Option<JoinHandle<()>>>,
    pub(crate) sequence: AtomicU64,
}
impl Tasks {
    pub fn shutdown(&self) {
        if let Some(job) = self.current.lock().unwrap().as_ref() {
            job.cancel();
        }
        if let Some(worker) = self.worker.lock().unwrap().take() {
            let _ = worker.join();
        }
    }
}
fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("components.json"))
}
pub fn load_tools(app: &tauri::AppHandle) -> Tools {
    let mut settings = config_path(app)
        .ok()
        .and_then(|p| fs::read(p).ok())
        .filter(|v| v.len() <= 64 * 1024)
        .and_then(|v| serde_json::from_slice(&v).ok())
        .unwrap_or_default();
    if let Ok(resources) = app.path().resource_dir() {
        crate::bundled::apply_defaults(&mut settings, &resources);
    }
    settings
}
#[tauri::command]
pub fn tool_settings(state: State<'_, ToolState>) -> Tools {
    state.0.lock().unwrap().clone()
}
#[tauri::command]
pub async fn choose_component(
    kind: String,
    app: tauri::AppHandle,
    state: State<'_, ToolState>,
    tasks: State<'_, Tasks>,
) -> Result<Tools, String> {
    if !["ffmpeg", "whisper", "model"].contains(&kind.as_str()) {
        return Err("Nieznany komponent".into());
    }
    let dialog = rfd::AsyncFileDialog::new().set_title(match kind.as_str() {
        "ffmpeg" => "Wybierz ffmpeg.exe",
        "whisper" => "Wybierz whisper-cli.exe",
        _ => "Wybierz wielojęzyczny model GGML .bin",
    });
    let Some(file) = dialog.pick_file().await else {
        return Ok(state.0.lock().unwrap().clone());
    };
    let path = transcription::validate_tool(&kind, file.path())?;
    let current = tasks.current.lock().unwrap();
    if current.as_ref().is_some_and(|j| j.active()) {
        return Err("Poczekaj na zakończenie transkrypcji".into());
    }
    let mut settings = state.0.lock().unwrap();
    let mut next = settings.clone();
    match kind.as_str() {
        "ffmpeg" => next.ffmpeg = Some(path),
        "whisper" => next.whisper = Some(path),
        _ => next.model = Some(path),
    }
    let config = config_path(&app)?;
    let parent = config.parent().ok_or("Błąd ścieżki ustawień")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(
        serde_json::to_string_pretty(&next)
            .map_err(|e| e.to_string())?
            .as_bytes(),
    )
    .map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(&config).map_err(|e| e.to_string())?;
    *settings = next.clone();
    Ok(next)
}
#[tauri::command]
pub fn start_transcription(
    path: String,
    access: State<'_, Access>,
    tools: State<'_, ToolState>,
    tasks: State<'_, Tasks>,
) -> Result<u64, String> {
    let media = media_path(std::path::Path::new(&path))?;
    if !access
        .0
        .lock()
        .map_err(|_| "Błąd uprawnień")?
        .contains(&media)
    {
        return Err("Najpierw zaimportuj film lub otwórz jego projekt".into());
    }
    let tools = tools.0.lock().unwrap().validated()?;
    let mut current = tasks.current.lock().unwrap();
    if current.as_ref().is_some_and(|j| j.active()) {
        return Err("Inna transkrypcja jest w toku".into());
    }
    if let Some(worker) = tasks.worker.lock().unwrap().take() {
        let _ = worker.join();
    }
    let id = tasks.sequence.fetch_add(1, Ordering::SeqCst) + 1;
    let job = Arc::new(Job::new(id));
    let running = Arc::clone(&job);
    let worker = std::thread::Builder::new()
        .name("autonapisy-transcription".into())
        .spawn(move || {
            let result = transcription::execute(Arc::clone(&running), tools, media);
            let mut status = running.status.lock().unwrap();
            if running.cancel.load(Ordering::SeqCst) {
                status.state = "cancelled".into();
                status.message = "Anulowano. Poprzednie napisy pozostają bez zmian.".into();
                status.progress = None;
            } else {
                match result {
                    Ok((segments, duration)) => {
                        status.state = "completed".into();
                        status.message = if segments.is_empty() {
                            "Nie rozpoznano mowy. Wynik jest pusty.".into()
                        } else {
                            format!(
                                "Gotowe: {} segmentów. Sprawdź treść i zapisz projekt.",
                                segments.len()
                            )
                        };
                        status.progress = Some(100);
                        status.segments = Some(segments);
                        status.audio_duration = Some(duration);
                    }
                    Err(error) => {
                        status.state = "failed".into();
                        status.message = error;
                        status.progress = None;
                    }
                }
            }
        })
        .map_err(|e| e.to_string())?;
    *tasks.worker.lock().unwrap() = Some(worker);
    *current = Some(job);
    Ok(id)
}
#[tauri::command]
pub fn transcription_status(id: u64, tasks: State<'_, Tasks>) -> Result<Status, String> {
    let current = tasks.current.lock().unwrap();
    let job = current.as_ref().ok_or("Brak zadania")?;
    let status = job.status.lock().unwrap();
    if status.id != id {
        return Err("Nieaktualne zadanie".into());
    }
    Ok(status.clone())
}
#[tauri::command]
pub fn cancel_transcription(id: u64, tasks: State<'_, Tasks>) -> Result<(), String> {
    let current = tasks.current.lock().unwrap();
    let job = current.as_ref().ok_or("Brak zadania")?;
    if job.status.lock().unwrap().id != id {
        return Err("Nieaktualne zadanie".into());
    }
    job.cancel();
    Ok(())
}
#[tauri::command]
pub async fn export_srt(json: String, captions: Option<String>) -> Result<Option<String>, String> {
    if json.len() > 16 * 1024 * 1024 {
        return Err("Projekt przekracza 16 MB".into());
    }
    let project = crate::project::parse(&json)?;
    if project.segments.is_empty() {
        return Err("Brak napisów do eksportu".into());
    }
    let segments = crate::project::export_captions(&project, captions.as_deref())?;
    let srt = crate::subtitles::to_srt(&segments)?;
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_file_name("napisy.srt")
        .add_filter("Napisy SRT", &["srt"])
        .save_file()
        .await
    else {
        return Ok(None);
    };
    let path = file.path();
    let parent = path.parent().ok_or("Niepoprawna ścieżka")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(srt.as_bytes()).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.to_string())?;
    Ok(Some(path_string(path)?))
}

#[derive(serde::Serialize)]
pub struct LicenseNotice {
    name: String,
    text: String,
}
#[tauri::command]
pub fn component_licenses(app: tauri::AppHandle) -> Result<Vec<LicenseNotice>, String> {
    let root = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("licenses");
    let mut notices = vec![LicenseNotice {
        name: "Komponenty i licencje".into(),
        text: include_str!("../../licenses/THIRD-PARTY-NOTICES.txt").into(),
    }];
    for file in [
        "FFmpeg-GPL-2.0.txt",
        "x264-COPYING.txt",
        "whisper.cpp-MIT.txt",
        "ggml-MIT.txt",
        "FFmpeg-build.txt",
        "components.json",
        "SHA256SUMS.txt",
    ] {
        let path = root.join(file);
        if path.is_file() {
            let text = fs::read_to_string(&path)
                .map_err(|e| format!("Nie można odczytać licencji: {e}"))?;
            if text.len() > 2 * 1024 * 1024 {
                return Err("Plik licencji jest zbyt duży".into());
            }
            notices.push(LicenseNotice {
                name: file.into(),
                text,
            });
        }
    }
    notices.push(LicenseNotice { name: "Pliki licencji i źródeł".into(), text: format!("Licencje: {}\nŹródła i skrypty budowania: {}\nW wersji z narzędziami te foldery są instalowane razem z aplikacją. Raporty bibliotek: zaleznosci-frontend.json i zaleznosci-rust.html.", root.display(), root.parent().unwrap().join("sources").display()) });
    Ok(notices)
}
