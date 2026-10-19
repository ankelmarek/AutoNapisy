//! Technical 0.33a harness. Production export remains guarded until the 0.33c acceptance.
use crate::{
    caption_stream::CaptionStream,
    export_studio::{self, Entry, Options},
    project,
    smart_export::{self, SampleRange},
    studio_commands,
    transcription::Job,
};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Manager, State};
struct Session {
    stream: CaptionStream,
    entry: Entry,
    range: SampleRange,
    finished: AtomicBool,
}
struct Slot {
    id: u64,
    job: Arc<Job>,
    session: Option<Arc<Session>>,
}
#[derive(Default)]
pub struct CaptionPocState {
    slot: Mutex<Option<Slot>>,
    ids: AtomicU64,
}
impl CaptionPocState {
    pub fn shutdown(&self) {
        let slot = self.slot.lock().unwrap().take();
        if let Some(s) = slot {
            s.job.cancel();
            drop(s);
        }
    }
    fn get(&self, id: u64) -> Result<Arc<Session>, String> {
        self.slot
            .lock()
            .unwrap()
            .as_ref()
            .filter(|s| s.id == id)
            .and_then(|s| s.session.clone())
            .ok_or("Nieaktualny test napisów".into())
    }
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Prepared {
    id: u64,
    width: u32,
    height: u32,
    frames: usize,
    start: f64,
    duration: f64,
}
#[tauri::command]
pub async fn caption_poc_begin(
    app: tauri::AppHandle,
    json: String,
    captions: String,
    width: u32,
    height: u32,
    start: f64,
    duration: f64,
) -> Result<Prepared, String> {
    if !cfg!(feature = "ui-tests") {
        return Err("Test techniczny jest dostępny tylko w osobnym buildzie testowym".into());
    }
    let mut p = studio_commands::authorize(&json, &app)?;
    p.segments = project::export_captions(&p, Some(&captions))?;
    if width < 128
        || height < 128
        || width % 2 != 0
        || height % 2 != 0
        || width
            .checked_mul(height)
            .is_none_or(|n| n > crate::caption_stream::MAX_PIXELS)
    {
        return Err("Nieprawidłowy rozmiar POC".into());
    }
    let range = SampleRange::new(start, duration, project::composition_duration(&p))?;
    let (ff, melt) = studio_commands::tools(&app)?;
    let state = app.state::<CaptionPocState>();
    let id = state.ids.fetch_add(1, Ordering::SeqCst) + 1;
    let job = Arc::new(Job::new(id));
    {
        let mut slot = state.slot.lock().unwrap();
        if slot.is_some() {
            return Err("Zakończ poprzedni test napisów".into());
        }
        *slot = Some(Slot {
            id,
            job: job.clone(),
            session: None,
        });
    }
    let running = job.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let entry = Entry::prepare(
            p,
            Options {
                width: Some(width),
                height: Some(height),
                captions: "none".into(),
                speed: "fast".into(),
                ..Default::default()
            },
            &std::env::temp_dir(),
            ff,
            melt,
            running.clone(),
        )?;
        let frames = (range.duration * 30.).round() as usize;
        let stream = CaptionStream::start(
            running.clone(),
            &entry.ff,
            entry.dir.path(),
            width,
            height,
            frames,
        )?;
        running.check()?;
        Ok::<_, String>(Arc::new(Session {
            stream,
            entry,
            range,
            finished: AtomicBool::new(false),
        }))
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    let mut slot = state.slot.lock().unwrap();
    match result {
        Ok(session)
            if !job.cancel.load(Ordering::SeqCst) && slot.as_ref().is_some_and(|s| s.id == id) =>
        {
            let range = session.range;
            slot.as_mut().unwrap().session = Some(session);
            Ok(Prepared {
                id,
                width,
                height,
                frames: (range.duration * 30.).round() as usize,
                start: range.start,
                duration: range.duration,
            })
        }
        other => {
            if slot.as_ref().is_some_and(|s| s.id == id) {
                slot.take();
            }
            Err(other.err().unwrap_or_else(|| "Anulowano test".into()))
        }
    }
}
#[tauri::command]
pub async fn caption_poc_frame(
    request: tauri::ipc::Request<'_>,
    state: State<'_, CaptionPocState>,
) -> Result<(), String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b,
        _ => return Err("Wymagany binarny pakiet RGBA".into()),
    };
    let (id, index) = crate::caption_stream::packet(bytes)?;
    let s = state.get(id)?;
    if s.finished.load(Ordering::SeqCst) {
        return Err("Test jest zakończony".into());
    }
    let bytes = bytes[16..].to_vec();
    tauri::async_runtime::spawn_blocking(move || s.stream.push(index, bytes))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn caption_poc_finish(app: tauri::AppHandle, id: u64) -> Result<String, String> {
    let s = app.state::<CaptionPocState>().get(id)?;
    if s.finished.swap(true, Ordering::SeqCst) {
        return Err("Test jest już renderowany".into());
    }
    let result = tauri::async_runtime::spawn_blocking(move || {
        s.stream.finish()?;
        let e = &s.entry;
        let job = e.job.lock().unwrap().clone();
        job.check()?;
        if export_studio::source_basis(&e.project, &e.ff, &e.melt)? != e.basis {
            return Err("Źródła zmieniły się".into());
        }
        let first = (s.range.start * 30.).round() as i64;
        let last = first + (s.range.duration * 30.).round() as i64 - 1;
        let source = e.dir.path().join("source");
        std::fs::create_dir(&source).map_err(|e| e.to_string())?;
        let input = export_studio::assemble(
            &job,
            &e.ff,
            &e.melt,
            &e.project,
            &e.meta,
            &source,
            Some((first, last)),
        )?;
        let output = e.dir.path().join("encoded");
        std::fs::create_dir(&output).map_err(|e| e.to_string())?;
        let path = smart_export::encode_with_layer(
            e,
            &job,
            &e.options,
            &input,
            &output,
            s.range.start,
            s.range.duration,
            128 * 1024 * 1024,
            Some(&s.stream.output),
        )?;
        job.check()?;
        if export_studio::source_basis(&e.project, &e.ff, &e.melt)? != e.basis {
            return Err("Źródła zmieniły się podczas testu".into());
        }
        Ok::<PathBuf, String>(path)
    })
    .await
    .map_err(|e| e.to_string())??;
    let state = app.state::<CaptionPocState>();
    let slot = state.slot.lock().unwrap();
    let slot = slot
        .as_ref()
        .filter(|s| s.id == id)
        .ok_or("Anulowano test")?;
    slot.job.check()?;
    app.asset_protocol_scope()
        .allow_file(&result)
        .map_err(|e| e.to_string())?;
    // Keep active until explicit cleanup; cancellation can always remove the temporary result.
    crate::path_string(&result)
}
#[tauri::command]
pub async fn caption_poc_cancel(id: u64, state: State<'_, CaptionPocState>) -> Result<(), String> {
    let slot = {
        let mut slot = state.slot.lock().unwrap();
        if slot.as_ref().is_none_or(|s| s.id != id) {
            return Ok(());
        }
        slot.take()
    };
    if let Some(s) = slot {
        s.job.cancel();
        tauri::async_runtime::spawn_blocking(move || drop(s))
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
