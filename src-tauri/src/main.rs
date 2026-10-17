#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod analysis_commands;
mod bundled;
mod commands;
mod effects;
mod export_commands;
mod montage;
mod project;
mod rendering;
mod subtitles;
mod transcription;
mod waveform;
use serde::Serialize;
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State};
#[derive(Default)]
struct Access(Mutex<HashSet<PathBuf>>);
fn path_string(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or("Ścieżka nie jest poprawnym Unicode".into())
}
fn media_path(path: &Path) -> Result<PathBuf, String> {
    let p = fs::canonicalize(path).map_err(|e| format!("Nie można znaleźć filmu: {e}"))?;
    if !p.is_file() {
        return Err("Wybrana ścieżka nie jest plikiem".into());
    }
    let ext = p
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ![
        "mp4", "mov", "mkv", "webm", "avi", "m4v", "mp3", "wav", "m4a", "aac", "flac", "ogg",
        "opus",
    ]
    .contains(&ext.as_str())
    {
        return Err("Nieobsługiwane rozszerzenie filmu".into());
    }
    Ok(p)
}
#[derive(Serialize)]
struct Imported {
    path: String,
    name: String,
}
#[tauri::command]
async fn import_video(
    kind: Option<String>,
    access: State<'_, Access>,
) -> Result<Option<Vec<Imported>>, String> {
    let dialog = rfd::AsyncFileDialog::new();
    let dialog = match kind.as_deref().unwrap_or("video") {
        "video" => dialog.add_filter("Film", &["mp4", "mov", "mkv", "webm", "avi", "m4v"]),
        "audio" => dialog.add_filter(
            "Audio",
            &["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus"],
        ),
        _ => return Err("Nieprawidłowy rodzaj importu".into()),
    };
    let Some(files) = dialog.pick_files().await else {
        return Ok(None);
    };
    if files.len() > 100 {
        return Err("Maksymalnie 100 plików jednocześnie".into());
    }
    let mut imported = Vec::new();
    for file in files {
        let p = media_path(file.path())?;
        let path = path_string(&p)?;
        let name = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Plik")
            .to_owned();
        access.0.lock().map_err(|_| "Błąd uprawnień")?.insert(p);
        imported.push(Imported { path, name });
    }
    Ok(Some(imported))
}
#[tauri::command]
fn prepare_preview(
    path: String,
    app: tauri::AppHandle,
    access: State<'_, Access>,
) -> Result<String, String> {
    let p = media_path(Path::new(&path))?;
    if !access.0.lock().map_err(|_| "Błąd uprawnień")?.contains(&p) {
        return Err(
            "Brak uprawnień do filmu. Wybierz plik przez dialog importu lub otwórz projekt.".into(),
        );
    }
    app.asset_protocol_scope()
        .allow_file(&p)
        .map_err(|e| e.to_string())?;
    path_string(&p)
}
#[derive(Serialize)]
struct Opened {
    json: String,
    path: String,
}
#[tauri::command]
async fn open_project(access: State<'_, Access>) -> Result<Option<Opened>, String> {
    let Some(file) = rfd::AsyncFileDialog::new()
        .add_filter("Projekt RolVixa", &["json"])
        .pick_file()
        .await
    else {
        return Ok(None);
    };
    let mut json = String::new();
    fs::File::open(file.path())
        .map_err(|e| e.to_string())?
        .take(16 * 1024 * 1024 + 1)
        .read_to_string(&mut json)
        .map_err(|e| e.to_string())?;
    if json.len() > 16 * 1024 * 1024 {
        return Err("Projekt przekracza limit 16 MB".into());
    }
    let p = project::parse(&json)?;
    for path in p
        .media
        .iter()
        .map(|m| m.path.as_str())
        .chain(p.assets.iter().map(|a| a.path.as_str()))
    {
        if let Ok(path) = media_path(Path::new(path)) {
            access.0.lock().map_err(|_| "Błąd uprawnień")?.insert(path);
        }
    }
    Ok(Some(Opened {
        json,
        path: path_string(file.path())?,
    }))
}
#[tauri::command]
async fn save_project(json: String) -> Result<Option<String>, String> {
    if json.len() > 16 * 1024 * 1024 {
        return Err("Projekt przekracza limit 16 MB".into());
    }
    project::parse(&json)?;
    let Some(file) = rfd::AsyncFileDialog::new()
        .add_filter("Projekt RolVixa", &["json"])
        .set_file_name("projekt.rolvixa.json")
        .save_file()
        .await
    else {
        return Ok(None);
    };
    let path = file.path();
    let dir = path.parent().ok_or("Niepoprawna ścieżka zapisu")?;
    let mut temp = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    temp.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path)
        .map_err(|e| format!("Nie można zapisać projektu: {e}"))?;
    Ok(Some(path_string(path)?))
}
#[derive(Serialize)]
struct Component {
    name: String,
    status: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Diagnostics {
    os: String,
    arch: String,
    cpu: String,
    logical_cpus: usize,
    memory_bytes: u64,
    components: Vec<Component>,
}
#[tauri::command]
fn diagnostics(tools: State<'_, commands::ToolState>) -> Diagnostics {
    let tools = tools.0.lock().unwrap().clone();
    let component_status = |kind: &str, path: Option<&Path>| match path {
        None => "Nie wybrano pliku — ustaw w sekcji Transkrypcja".to_owned(),
        Some(p) => match transcription::validate_tool(kind, p) {
            Ok(_) => format!(
                "Wybrano: {} (sprawdzenie uruchomienia przy transkrypcji)",
                p.display()
            ),
            Err(e) => format!("Niedostępny: {e}"),
        },
    };
    let mut system = sysinfo::System::new_all();
    system.refresh_all();
    Diagnostics {
        os: sysinfo::System::long_os_version().unwrap_or_else(|| std::env::consts::OS.into()),
        arch: std::env::consts::ARCH.into(),
        cpu: system
            .cpus()
            .first()
            .map(|c| c.brand().to_owned())
            .unwrap_or("Brak danych".into()),
        logical_cpus: system.cpus().len(),
        memory_bytes: system.total_memory(),
        components: vec![
            Component {
                name: "Podgląd".into(),
                status: "Odtwarzacz systemowy; obsługa kodeka sprawdzana przy imporcie".into(),
            },
            Component {
                name: "whisper.cpp".into(),
                status: component_status("whisper", tools.whisper.as_deref()),
            },
            Component {
                name: "FFmpeg / audio i MP4".into(),
                status: component_status("ffmpeg", tools.ffmpeg.as_deref()),
            },
            Component {
                name: "Model Whisper".into(),
                status: component_status("model", tools.model.as_deref()),
            },
            Component {
                name: "GPU / akceleracja".into(),
                status: "Transkrypcja CPU; GPU wyłączone".into(),
            },
        ],
    }
}
fn main() {
    let app = tauri::Builder::default()
        .manage(Access::default())
        .manage(analysis_commands::AnalysisState::default())
        .manage(commands::ToolState::default())
        .manage(commands::Tasks::default())
        .manage(export_commands::ExportState::default())
        .setup(|app| {
            *app.state::<commands::ToolState>().0.lock().unwrap() =
                commands::load_tools(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            import_video,
            analysis_commands::audio_waveform,
            prepare_preview,
            open_project,
            save_project,
            diagnostics,
            commands::tool_settings,
            commands::component_licenses,
            commands::choose_component,
            commands::start_transcription,
            commands::transcription_status,
            commands::cancel_transcription,
            commands::export_srt,
            export_commands::begin_video_export,
            export_commands::upload_export_frame,
            export_commands::finish_export_frames,
            export_commands::cancel_video_export
        ])
        .build(tauri::generate_context!())
        .expect("Nie można uruchomić RolVixa");
    app.run(|handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            handle
                .state::<analysis_commands::AnalysisState>()
                .shutdown();
            handle.state::<commands::Tasks>().shutdown();
            handle.state::<export_commands::ExportState>().shutdown();
        }
    });
}
