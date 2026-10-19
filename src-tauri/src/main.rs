#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod smart_cut;
mod smart_cut_commands;
mod analysis_commands;
mod audio_commands;
mod audio_library;
mod bundled;
mod commands;
mod effects;
mod export_commands;
mod framing;
mod proxy;
mod proxy_commands;
mod mlt_commands;
mod montage;
mod preview_commands;
mod project;
mod project_file;
mod recent_projects;
mod recovery;
mod source_preview;
mod media_sources;
mod source_commands;
mod quality;
mod quality_commands;
mod project_commands;
mod rendering;
mod subtitles;
mod transcription;
mod transition_preview;
mod waveform;
use serde::Serialize;
use std::{
    collections::HashSet,
    fs,
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
fn diagnostics(
    tools: State<'_, commands::ToolState>,
    mlt: State<'_, mlt_commands::MltState>,
) -> Diagnostics {
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
                name: "Silnik MLT".into(),
                status: mlt
                    .path()
                    .map(|p| format!("Gotowy: {}", p.display()))
                    .unwrap_or_else(|e| e),
            },
            Component {
                name: "Podgląd".into(),
                status: "MLT → strumień H.264/AAC → WebView2".into(),
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
        .manage(smart_cut_commands::SmartCutState::default())
        .manage(source_commands::SourceState::default())
        .manage(quality_commands::QualityState::default())
        .manage(project_commands::ProjectState::default())
        .manage(proxy_commands::ProxyState::default())
        .manage(audio_commands::AudioLibraryState::default())
        .manage(mlt_commands::MltState::default())
        .manage(preview_commands::PreviewState::default())
        .manage(analysis_commands::AnalysisState::default())
        .manage(commands::ToolState::default())
        .manage(commands::Tasks::default())
        .manage(export_commands::ExportState::default())
        .setup(|app| {
            if let Err(error)=app.state::<proxy_commands::ProxyState>().initialize(app.handle()){
                app.state::<proxy_commands::ProxyState>().record_error(error);
            }
            *app.state::<commands::ToolState>().0.lock().unwrap() =
                commands::load_tools(app.handle());
            *app.state::<mlt_commands::MltState>().engine.lock().unwrap() = app
                .path()
                .resource_dir()
                .ok()
                .and_then(|p| mlt::executable(&p).ok());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            import_video,
            smart_cut_commands::analyze_smartcut,
            smart_cut_commands::cancel_smartcut,
            smart_cut_commands::validate_smartcut,
            quality_commands::start_quality_analysis,
            quality_commands::quality_analysis_status,
            quality_commands::cancel_quality_analysis,
            quality_commands::plan_normalization,
            source_commands::choose_source_replacement,
            source_commands::confirm_source_replacement,
            source_commands::discard_source_replacement,
            source_commands::check_project_sources,
            proxy_commands::proxy_info,
            proxy_commands::proxy_status,
            proxy_commands::start_proxy,
            proxy_commands::cancel_proxy,
            proxy_commands::set_proxy_enabled,
            proxy_commands::proxy_cache_info,
            proxy_commands::clear_proxy_cache,
            audio_commands::builtin_audio,
            audio_commands::search_audio,
            audio_commands::download_audio,
            audio_commands::audition_audio,
            audio_commands::preview_remote_audio,
            audio_commands::cancel_remote_audio,
            mlt_commands::start_mlt_preview,
            mlt_commands::read_mlt_preview,
            mlt_commands::cancel_mlt_preview,
            analysis_commands::audio_waveform,
            analysis_commands::media_info,
            analysis_commands::source_thumbnail,
            analysis_commands::layer_frames,
            prepare_preview,
            preview_commands::prepare_transition_preview,
            project_commands::new_project,
            project_commands::open_project,
            project_commands::save_project,
            project_commands::recent_projects,
            project_commands::open_recent_project,
            project_commands::remove_recent_project,
            project_commands::set_startup_screen,
            project_commands::clear_recent_projects,
            project_commands::recovery_status,
            project_commands::write_recovery,
            project_commands::clear_recovery,
            project_commands::resolve_recovery,
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
            handle.state::<smart_cut_commands::SmartCutState>().shutdown();
            handle.state::<quality_commands::QualityState>().shutdown();
            handle.state::<source_commands::SourceState>().shutdown();
            handle.state::<proxy_commands::ProxyState>().shutdown();
            handle
                .state::<analysis_commands::AnalysisState>()
                .shutdown();
            handle.state::<preview_commands::PreviewState>().shutdown();
            handle.state::<mlt_commands::MltState>().shutdown();
            handle
                .state::<audio_commands::AudioLibraryState>()
                .shutdown();
            handle.state::<commands::Tasks>().shutdown();
            handle.state::<export_commands::ExportState>().shutdown();
        }
    });
}

mod timeline_audio;

mod mlt;

mod audio_envelope;
