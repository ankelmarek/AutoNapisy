use crate::{
    commands::{Tasks, ToolState},
    media_path, path_string,
    project::{self, Project},
    rendering::{self, Fingerprint, Metadata},
    transcription::{self, ExportInfo, Job},
    Access,
};
use base64::Engine;
use std::{
    fs,
    path::PathBuf,
    sync::{atomic::Ordering, Arc, Mutex},
};
use tauri::State;
struct Session {
    id: u64,
    project: Project,
    media: PathBuf,
    ffmpeg: PathBuf,
    target: PathBuf,
    original: Option<Fingerprint>,
    dir: tempfile::TempDir,
    metadata: Option<Metadata>,
    received: Vec<bool>,
    bytes: usize,
}
#[derive(Default)]
pub struct ExportState(Arc<Mutex<Option<Session>>>);
impl ExportState {
    pub fn shutdown(&self) {
        self.0.lock().unwrap().take();
    }
}
fn job_for(tasks: &Tasks, id: u64) -> Result<Arc<Job>, String> {
    let current = tasks.current.lock().unwrap();
    let job = current.as_ref().ok_or("Brak zadania eksportu")?;
    if job.status.lock().unwrap().id != id {
        return Err("Nieaktualny eksport".into());
    }
    Ok(Arc::clone(job))
}
fn failed(job: &Arc<Job>, error: String) {
    let mut status = job.status.lock().unwrap();
    if status.state == "completed" {
        return;
    }
    status.state = if job.cancel.load(Ordering::SeqCst) {
        "cancelled"
    } else {
        "failed"
    }
    .into();
    status.message = if status.state == "cancelled" {
        "Anulowano eksport. Plik docelowy pozostaje bez zmian.".into()
    } else {
        error
    };
    status.progress = None;
}
#[tauri::command]
pub async fn begin_video_export(
    json: String,
    captions: Option<String>,
    access: State<'_, Access>,
    tools: State<'_, ToolState>,
    tasks: State<'_, Tasks>,
    exports: State<'_, ExportState>,
) -> Result<Option<u64>, String> {
    if json.len() > 16 * 1024 * 1024 {
        return Err("Projekt przekracza 16 MB".into());
    }
    let mut project = project::parse(&json)?;
    if project::composition_duration(&project) <= 0.0 {
        return Err("Montaż jest pusty".into());
    }
    project.segments = project::export_captions(&project, captions.as_deref())?;
    if project.segments.len() > rendering::MAX_FRAMES {
        return Err(
            "Eksport wymaga od 0 do 3000 plansz napisów. Dłuższy film podziel na projekty.".into(),
        );
    }
    let media = media_path(std::path::Path::new(
        &project.media.as_ref().ok_or("Zaimportuj film")?.path,
    ))?;
    if !access
        .0
        .lock()
        .map_err(|_| "Błąd uprawnień")?
        .contains(&media)
    {
        return Err("Najpierw zaimportuj film lub otwórz jego projekt".into());
    }
    for asset in &mut project.assets {
        let path = media_path(std::path::Path::new(&asset.path))?;
        if !access
            .0
            .lock()
            .map_err(|_| "Błąd uprawnień")?
            .contains(&path)
        {
            return Err("Brak uprawnień do źródła".into());
        }
        asset.path = path_string(&path)?;
    }
    if let Some(m) = &mut project.media {
        m.path = path_string(&media)?;
    }
    let ffmpeg = {
        let settings = tools.0.lock().unwrap();
        transcription::validate_tool(
            "ffmpeg",
            settings
                .ffmpeg
                .as_deref()
                .ok_or("Wskaż FFmpeg w ustawieniach")?,
        )?
    };
    rendering::ffprobe_path(&ffmpeg)?;
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_title("Eksport MP4 z napisami")
        .set_file_name("film-z-napisami.mp4")
        .add_filter("Film MP4", &["mp4"])
        .save_file()
        .await
    else {
        return Ok(None);
    };
    let mut target = file.path().to_owned();
    if target.extension().is_none() {
        target.set_extension("mp4");
    }
    rendering::validate_destination(&media, &target)?;
    for a in &project.assets {
        rendering::validate_destination(std::path::Path::new(&a.path), &target)?;
    }
    path_string(&target)?;
    let original = rendering::fingerprint(&target)?;
    let parent = target.parent().ok_or("Niepoprawna ścieżka eksportu")?;
    let dir = tempfile::Builder::new()
        .prefix("autonapisy-export-")
        .tempdir_in(parent)
        .map_err(|e| format!("Nie można przygotować eksportu: {e}"))?;
    let mut current = tasks.current.lock().unwrap();
    if current.as_ref().is_some_and(|j| j.active()) {
        return Err("Poczekaj na zakończenie obecnego zadania".into());
    }
    if let Some(worker) = tasks.worker.lock().unwrap().take() {
        let _ = worker.join();
    }
    let id = tasks.sequence.fetch_add(1, Ordering::SeqCst) + 1;
    let job = Arc::new(Job::new(id));
    job.status.lock().unwrap().message = "Sprawdzanie parametrów filmu…".into();
    let probe_dir = dir.path().to_owned();
    let probe_media = media.clone();
    let probe_ffmpeg = ffmpeg.clone();
    let count = project.segments.len();
    let target_text = path_string(&target)?;
    *exports.0.lock().unwrap() = Some(Session {
        id,
        project,
        media,
        ffmpeg,
        target,
        original,
        dir,
        metadata: None,
        received: vec![false; count],
        bytes: 0,
    });
    let running = Arc::clone(&job);
    let sessions = Arc::clone(&exports.0);
    let worker = std::thread::Builder::new()
        .name("autonapisy-export-probe".into())
        .spawn(move || {
            let result = rendering::inspect(&running, &probe_ffmpeg, &probe_media, &probe_dir);
            let mut slot = sessions.lock().unwrap();
            match result {
                Ok(mut meta) if !running.cancel.load(Ordering::SeqCst) => {
                    if let Some(session) = slot.as_mut().filter(|s| s.id == id) {
                        if session.project.clips.as_ref().is_some_and(|clips| {
                            clips.iter().any(|c| {
                                c.asset_id.is_none() && c.source_out > meta.duration + 0.05
                            })
                        }) {
                            slot.take();
                            failed(&running, "Ujęcie wychodzi poza rzeczywisty film".into());
                            return;
                        }
                        meta.duration = project::composition_duration(&session.project);
                        session.metadata = Some(meta.clone());
                        let mut status = running.status.lock().unwrap();
                        if running.cancel.load(Ordering::SeqCst) {
                            drop(status);
                            slot.take();
                            failed(&running, "Anulowano".into());
                            return;
                        }
                        status.state = "awaiting_frames".into();
                        status.message = "Przygotowywanie plansz…".into();
                        status.progress = Some(0);
                        status.export_info = Some(ExportInfo {
                            width: meta.width,
                            height: meta.height,
                            duration: meta.duration,
                            frames: count,
                            received: 0,
                            output_path: target_text,
                        });
                    }
                }
                other => {
                    slot.take();
                    failed(&running, other.err().unwrap_or_else(|| "Anulowano".into()));
                }
            }
        })
        .map_err(|e| {
            exports.0.lock().unwrap().take();
            e.to_string()
        })?;
    *tasks.worker.lock().unwrap() = Some(worker);
    *current = Some(job);
    Ok(Some(id))
}
#[tauri::command]
pub async fn upload_export_frame(
    id: u64,
    index: usize,
    png: String,
    tasks: State<'_, Tasks>,
    exports: State<'_, ExportState>,
) -> Result<crate::transcription::Status, String> {
    if png.len() > rendering::MAX_PNG_BYTES * 4 / 3 + 8 {
        return Err("Plansza przekracza 8 MB".into());
    }
    let job = job_for(&tasks, id)?;
    let sessions = Arc::clone(&exports.0);
    tauri::async_runtime::spawn_blocking(move || {
        job.check()?;
        if job.status.lock().unwrap().state != "awaiting_frames" {
            return Err("Eksport nie przyjmuje plansz".into());
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(png)
            .map_err(|_| "Niepoprawna plansza Base64")?;
        let mut slot = sessions.lock().unwrap();
        let session = slot
            .as_mut()
            .filter(|s| s.id == id)
            .ok_or("Nieaktualny eksport")?;
        if index >= session.received.len() || session.received[index] {
            return Err("Niepoprawny lub powtórzony numer planszy".into());
        }
        if session.bytes + bytes.len() > rendering::MAX_TOTAL_BYTES {
            return Err(
                "Plansze przekraczają 512 MB. Zmniejsz rozdzielczość źródła lub długość projektu."
                    .into(),
            );
        }
        let meta = session.metadata.as_ref().ok_or("Brak parametrów filmu")?;
        rendering::validate_frame(&bytes, meta)?;
        job.check()?;
        fs::write(
            session.dir.path().join(rendering::frame_name(index)),
            &bytes,
        )
        .map_err(|e| e.to_string())?;
        session.bytes += bytes.len();
        session.received[index] = true;
        let received = session.received.iter().filter(|v| **v).count();
        let count = session.received.len();
        let mut status = job.status.lock().unwrap();
        if job.cancel.load(Ordering::SeqCst) {
            return Err("Anulowano eksport".into());
        }
        if let Some(info) = status.export_info.as_mut() {
            info.received = received;
        }
        status.progress = Some((received * 100 / count) as u8);
        status.message = format!("Przygotowywanie plansz: {received} / {count}");
        Ok(status.clone())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn finish_export_frames(
    id: u64,
    tasks: State<'_, Tasks>,
    exports: State<'_, ExportState>,
) -> Result<(), String> {
    let job = job_for(&tasks, id)?;
    job.check()?;
    if job.status.lock().unwrap().state != "awaiting_frames" {
        return Err("Eksport nie jest gotowy do renderowania".into());
    }
    let mut slot = exports.0.lock().unwrap();
    let session = slot
        .as_ref()
        .filter(|s| s.id == id)
        .ok_or("Nieaktualny eksport")?;
    if !session.received.iter().all(|v| *v) {
        return Err("Nie wszystkie plansze zostały przygotowane".into());
    }
    let session = slot.take().unwrap();
    drop(slot);
    if let Some(worker) = tasks.worker.lock().unwrap().take() {
        let _ = worker.join();
    }
    {
        let mut status = job.status.lock().unwrap();
        if job.cancel.load(Ordering::SeqCst) {
            return Err("Anulowano eksport".into());
        }
        status.state = "rendering".into();
        status.progress = Some(0);
        status.message = "Kodowanie MP4 z napisami…".into();
    }
    let running = Arc::clone(&job);
    let worker = std::thread::Builder::new()
        .name("autonapisy-video-export".into())
        .spawn(move || {
            let result = rendering::render(
                &running,
                &session.ffmpeg,
                &session.media,
                &session.target,
                &session.original,
                session.dir.path(),
                &session.project,
                session.metadata.as_ref().unwrap(),
            );
            if let Err(error) = result {
                failed(&running, error);
            }
            // Session owns the temporary directory and drops it on every exit path.
        })
        .map_err(|e| {
            failed(&job, e.to_string());
            e.to_string()
        })?;
    *tasks.worker.lock().unwrap() = Some(worker);
    Ok(())
}
#[tauri::command]
pub fn cancel_video_export(
    id: u64,
    tasks: State<'_, Tasks>,
    exports: State<'_, ExportState>,
) -> Result<(), String> {
    let job = job_for(&tasks, id)?;
    let waiting = job.status.lock().unwrap().state == "awaiting_frames";
    job.cancel();
    if waiting {
        let mut slot = exports.0.lock().unwrap();
        if slot.as_ref().is_some_and(|s| s.id == id) {
            slot.take();
        }
        failed(&job, "Anulowano eksport".into());
    }
    Ok(())
}
