use crate::{
    commands::ToolState,
    media_path, mlt,
    project::{self, Project},
    transcription::{validate_tool, Job},
    Access,
};
use base64::Engine;
use std::{
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::State;
#[derive(Default)]
pub struct MltState {
    pub engine: Mutex<Option<PathBuf>>,
    current: Mutex<Option<Session>>,
    sequence: AtomicU64,
    workers: Mutex<Vec<(Arc<Job>, std::thread::JoinHandle<()>)>>,
    gate: Arc<Mutex<()>>,
    cache: Arc<Mutex<mlt::TransitionCache>>,
}
struct Session {
    id: u64,
    job: Arc<Job>,
    dir: Arc<tempfile::TempDir>,
    aspect: Arc<Mutex<Option<f64>>>,
}
impl MltState {
    pub fn path(&self) -> Result<PathBuf, String> {
        self.engine
            .lock()
            .unwrap()
            .clone()
            .ok_or("Brakuje silnika MLT. Zainstaluj pełną wersję RolVixa.".into())
    }
    pub fn shutdown(&self) {
        let mut w = self.workers.lock().unwrap();
        for (j, _) in w.iter() {
            j.cancel();
        }
        for (_, h) in w.drain(..) {
            let _ = h.join();
        }
        self.current.lock().unwrap().take();
    }
}
pub fn authorized(json: &str, access: &Access) -> Result<Project, String> {
    if json.len() > 16 * 1024 * 1024 {
        return Err("Projekt przekracza 16 MB".into());
    }
    let mut p = project::parse(json)?;
    if p.clips.is_none() {
        p.clips = Some(
            p.media
                .as_ref()
                .and_then(|m| m.duration)
                .map(|d| {
                    vec![crate::project::Clip {
                        id: "original".into(),
                        source_out: d,
                        kind: "video".into(),
                        volume: 1.,
                        ..Default::default()
                    }]
                })
                .unwrap_or_default(),
        );
    }
    let allowed = access.0.lock().map_err(|_| "Błąd uprawnień")?;
    if let Some(m) = &p.media {
        let path = media_path(Path::new(&m.path))?;
        if !allowed.contains(&path) {
            return Err("Najpierw zaimportuj główny film".into());
        }
    }
    for c in p.clips.as_deref().unwrap_or(&[]) {
        let path = media_path(Path::new(p.clip_path(c).ok_or("Brak źródła")?))?;
        if !allowed.contains(&path) {
            return Err("Najpierw zaimportuj źródła montażu".into());
        }
    }
    Ok(p)
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Start {
    id: u64,
    start: f64,
    duration: f64,
}
#[derive(serde::Serialize)]
pub struct Chunk {
    data: String,
    offset: u64,
    done: bool,
    error: Option<String>,
    aspect: Option<f64>,
}
#[tauri::command]
pub fn start_mlt_preview(
    json: String,
    from: f64,
    access: State<'_, Access>,
    tools: State<'_, ToolState>,
    state: State<'_, MltState>,
) -> Result<Start, String> {
    let p = authorized(&json, &access)?;
    let duration = project::composition_duration(&p);
    if duration <= 0.0 || !from.is_finite() {
        return Err("Montaż jest pusty lub nieprawidłowa pozycja".into());
    }
    let start = mlt::frame(from.clamp(0.0, (duration - 1.0 / 30.0).max(0.0)));
    let melt = state.path()?;
    let ffmpeg = {
        let t = tools.0.lock().unwrap();
        validate_tool("ffmpeg", t.ffmpeg.as_deref().ok_or("Wskaż FFmpeg")?)?
    };
    let dir = Arc::new(
        tempfile::Builder::new()
            .prefix("rolvixa-mlt-")
            .tempdir()
            .map_err(|e| e.to_string())?,
    );
    let aspect = Arc::new(Mutex::new(None));
    let id = state.sequence.fetch_add(1, Ordering::SeqCst) + 1;
    let job = Arc::new(Job::new(id));
    if let Some(old) = state.current.lock().unwrap().as_ref() {
        old.job.cancel();
    }
    *state.current.lock().unwrap() = Some(Session {
        id,
        job: job.clone(),
        dir: dir.clone(),
        aspect: aspect.clone(),
    });
    let running = job.clone();
    let gate = state.gate.clone();
    let cache = state.cache.clone();
    let worker = std::thread::Builder::new()
        .name("rolvixa-mlt-preview".into())
        .spawn(move || {
            let result = (|| {
                let _guard = gate.lock().map_err(|_| "Błąd kolejki MLT")?;
                running.check()?;
                let mut meta = if let Some(media) = &p.media {
                    crate::rendering::inspect(
                        &running,
                        &ffmpeg,
                        Path::new(&media.path),
                        dir.path(),
                    )?
                } else {
                    crate::rendering::Metadata {
                        width: 1280,
                        height: 720,
                        duration,
                        has_audio: true,
                    }
                };
                crate::framing::apply_canvas(&p, &mut meta);
                *aspect.lock().unwrap() = Some(meta.width as f64 / meta.height as f64);
                let scale = (540.0 / meta.width.max(meta.height) as f64).min(1.0);
                meta.width = ((meta.width as f64 * scale / 2.).round() as u32 * 2).max(2);
                meta.height = ((meta.height as f64 * scale / 2.).round() as u32 * 2).max(2);
                mlt::prepare_cached(&running, &ffmpeg, &p, &meta, dir.path(), &cache)?;
                mlt::run(
                    &running,
                    &melt,
                    dir.path(),
                    start,
                    mlt::frame(duration) - 1,
                    true,
                    false,
                )?;
                Ok::<(), String>(())
            })();
            let mut s = running.status.lock().unwrap();
            s.state = if running.cancel.load(Ordering::SeqCst) {
                "cancelled"
            } else if result.is_ok() {
                "completed"
            } else {
                "failed"
            }
            .into();
            if let Err(e) = result {
                s.message = e;
            }
        })
        .map_err(|e| e.to_string())?;
    let mut workers = state.workers.lock().unwrap();
    let mut i = 0;
    while i < workers.len() {
        if workers[i].1.is_finished() {
            let (_, h) = workers.swap_remove(i);
            let _ = h.join();
        } else {
            i += 1;
        }
    }
    workers.push((job, worker));
    Ok(Start {
        id,
        start: start as f64 / 30.,
        duration,
    })
}
#[tauri::command]
pub fn read_mlt_preview(id: u64, offset: u64, state: State<'_, MltState>) -> Result<Chunk, String> {
    let slot = state.current.lock().unwrap();
    let s = slot
        .as_ref()
        .filter(|s| s.id == id)
        .ok_or("Nieaktualny podgląd MLT")?;
    if offset > 512 * 1024 * 1024 {
        s.job.cancel();
        return Err(
            "Bufor podglądu przekroczył 512 MB. Przewiń film, aby rozpocząć nowy bufor.".into(),
        );
    }
    let mut bytes = vec![];
    let file = s.dir.path().join("preview.mp4");
    match std::fs::File::open(&file) {
        Ok(mut f) => {
            let len = f.metadata().map_err(|e| e.to_string())?.len();
            if offset > len {
                return Err("Nieprawidłowy odczyt podglądu".into());
            }
            f.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
            f.take(512 * 1024)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("Nie można odczytać bufora podglądu MLT: {e}")),
    }
    let status = s.job.status.lock().unwrap();
    let finished = ["completed", "failed", "cancelled"].contains(&status.state.as_str());
    let aspect = *s.aspect.lock().unwrap();
    Ok(Chunk {
        aspect,
        offset: offset + bytes.len() as u64,
        done: finished && bytes.is_empty(),
        data: base64::engine::general_purpose::STANDARD.encode(bytes),
        error: if status.state == "failed" {
            Some(status.message.clone())
        } else {
            None
        },
    })
}
#[tauri::command]
pub fn cancel_mlt_preview(id: u64, state: State<'_, MltState>) {
    if let Some(s) = state
        .current
        .lock()
        .unwrap()
        .as_ref()
        .filter(|s| s.id == id)
    {
        s.job.cancel();
    }
}
