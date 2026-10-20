//! Bounded binary RGBA -> lossless alpha video. At most one queued frame plus one writer frame.
use crate::transcription::{self, Job};
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{sync_channel, SyncSender},
        Arc, Mutex, OnceLock, Weak,
    },
    thread::JoinHandle,
};
pub const MAX_PIXELS: u32 = 1280 * 1280;
pub const MAX_FRAMES: usize = 150;
pub const MAX_BYTES: u64 = 1024 * 1024 * 1024;
pub const EXPORT_PIXELS: u32 = 16_777_216;
pub const EXPORT_FRAMES: usize = 24 * 60 * 60 * 30;
pub const EXPORT_BYTES: u64 = 4 * 1024 * 1024 * 1024;
static IDS: AtomicU64 = AtomicU64::new(0);
static REGISTRY: OnceLock<Mutex<std::collections::HashMap<u64, Weak<CaptionStream>>>> =
    OnceLock::new();
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadInfo {
    pub id: u64,
    pub frames: usize,
    pub start: f64,
}
pub fn lookup(id: u64) -> Result<Arc<CaptionStream>, String> {
    REGISTRY
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| "Błąd strumieni")?
        .get(&id)
        .and_then(Weak::upgrade)
        .ok_or_else(|| "Nieaktualny strumień animacji".into())
}
pub fn shutdown() {
    let streams = REGISTRY
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .values()
        .filter_map(Weak::upgrade)
        .collect::<Vec<_>>();
    for stream in streams {
        stream.abort();
    }
}
pub fn export_stream(
    job: Arc<Job>,
    ff: &Path,
    dir: Arc<tempfile::TempDir>,
    width: u32,
    height: u32,
    start: f64,
    duration: f64,
) -> Result<(Arc<CaptionStream>, UploadInfo), String> {
    if !start.is_finite()
        || start < 0.
        || !duration.is_finite()
        || duration <= 0.
        || duration > 86400.
    {
        return Err("Nieprawidłowy zakres animacji".into());
    }
    let frames = (duration * 30. - 1e-7).ceil().max(1.) as usize;
    let mut stream = CaptionStream::start_limited(
        job,
        ff,
        dir.path(),
        width,
        height,
        frames,
        EXPORT_PIXELS,
        EXPORT_FRAMES,
        EXPORT_BYTES,
    )?;
    stream.owner = Some(dir);
    let stream = Arc::new(stream);
    let mut registry = REGISTRY
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| "Błąd strumieni")?;
    registry.retain(|_, v| v.strong_count() > 0);
    if registry.len() >= 16 {
        return Err("Zbyt wiele strumieni animacji".into());
    }
    let id = IDS.fetch_add(1, Ordering::SeqCst) + 1;
    registry.insert(id, Arc::downgrade(&stream));
    Ok((stream, UploadInfo { id, frames, start }))
}
struct Writer {
    sender: Option<SyncSender<Vec<u8>>>,
    next: usize,
}
pub struct CaptionStream {
    job: Arc<Job>,
    writer: Mutex<Writer>,
    worker: Mutex<Option<JoinHandle<Result<(), String>>>>,
    pub output: PathBuf,
    bytes: usize,
    frames: usize,
    max_bytes: u64,
    owner: Option<Arc<tempfile::TempDir>>,
}
impl CaptionStream {
    pub fn start(
        job: Arc<Job>,
        ff: &Path,
        dir: &Path,
        width: u32,
        height: u32,
        frames: usize,
    ) -> Result<Self, String> {
        Self::start_limited(
            job, ff, dir, width, height, frames, MAX_PIXELS, MAX_FRAMES, MAX_BYTES,
        )
    }
    fn start_limited(
        job: Arc<Job>,
        ff: &Path,
        dir: &Path,
        width: u32,
        height: u32,
        frames: usize,
        max_pixels: u32,
        max_frames: usize,
        max_bytes: u64,
    ) -> Result<Self, String> {
        if width < 128
            || height < 128
            || width % 2 != 0
            || height % 2 != 0
            || width.checked_mul(height).is_none_or(|n| n > max_pixels)
            || frames == 0
            || frames > max_frames
        {
            return Err("Nieprawidłowy rozmiar lub długość strumienia napisów".into());
        }
        job.check()?;
        let output = dir.join("animated-layer.mkv");
        let args: Vec<OsString> = [
            "-v".into(),
            "error".into(),
            "-nostdin".into(),
            "-y".into(),
            "-f".into(),
            "rawvideo".into(),
            "-pixel_format".into(),
            "rgba".into(),
            "-video_size".into(),
            format!("{width}x{height}"),
            "-framerate".into(),
            "30".into(),
            "-i".into(),
            "pipe:0".into(),
            "-an".into(),
            "-c:v".into(),
            "ffv1".into(),
            "-level".into(),
            "3".into(),
            "-pix_fmt".into(),
            "bgra".into(),
            "-threads".into(),
            "2".into(),
            "-f".into(),
            "matroska".into(),
            "animated-layer.mkv".into(),
        ]
        .into_iter()
        .map(Into::into)
        .collect();
        let (tx, rx) = sync_channel(1);
        let ff = ff.to_owned();
        let dir = dir.to_owned();
        let out = output.clone();
        let running = job.clone();
        let worker = std::thread::Builder::new()
            .name("caption-alpha-stream".into())
            .spawn(move || {
                transcription::run_process_stream(&running, &ff, &args, &dir, &out, max_bytes, rx)
            })
            .map_err(|e| e.to_string())?;
        Ok(Self {
            job,
            writer: Mutex::new(Writer {
                sender: Some(tx),
                next: 0,
            }),
            worker: Mutex::new(Some(worker)),
            output,
            bytes: width as usize * height as usize * 4,
            frames,
            max_bytes,
            owner: None,
        })
    }
    pub fn push(&self, index: usize, bytes: Vec<u8>) -> Result<(), String> {
        self.job.check()?;
        let mut w = self
            .writer
            .try_lock()
            .map_err(|_| "Klatka jest już przesyłana")?;
        if index != w.next || index >= self.frames || bytes.len() != self.bytes {
            return Err("Nieprawidłowa kolejność lub rozmiar klatki RGBA".into());
        }
        w.sender
            .as_ref()
            .ok_or("Strumień został zamknięty")?
            .send(bytes)
            .map_err(|_| "Enkoder zamknął strumień")?;
        w.next += 1;
        Ok(())
    }
    pub fn abort(&self) {
        self.job.cancel();
        self.writer.lock().unwrap().sender.take();
        if let Some(w) = self.worker.lock().unwrap().take() {
            let _ = w.join();
        }
        let _ = std::fs::remove_file(&self.output);
    }
    pub fn finish(&self) -> Result<(), String> {
        {
            let mut w = self.writer.lock().unwrap();
            if w.next != self.frames {
                return Err("Nie przesłano wszystkich klatek animacji".into());
            }
            if w.sender.take().is_none() {
                return Err("Strumień już zakończony".into());
            }
        }
        self.worker
            .lock()
            .unwrap()
            .take()
            .ok_or("Brak enkodera")?
            .join()
            .map_err(|_| "Błąd enkodera".to_owned())??;
        self.job.check()?;
        if std::fs::metadata(&self.output)
            .map_err(|e| e.to_string())?
            .len()
            > self.max_bytes
        {
            return Err("Warstwa napisów przekracza limit plików roboczych".into());
        }
        Ok(())
    }
}
impl Drop for CaptionStream {
    fn drop(&mut self) {
        if self.worker.get_mut().unwrap().is_some() {
            self.job.cancel();
        }
        self.writer.get_mut().unwrap().sender.take();
        if let Some(w) = self.worker.get_mut().unwrap().take() {
            let _ = w.join();
        }
    }
}
pub fn packet(bytes: &[u8]) -> Result<(u64, usize), String> {
    if bytes.len() < 16 || bytes.len() > 16 + EXPORT_PIXELS as usize * 4 || &bytes[..4] != b"RVC1" {
        return Err("Nieprawidłowy pakiet RGBA".into());
    }
    Ok((
        u64::from_le_bytes(bytes[4..12].try_into().unwrap()),
        u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize,
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn binary_header_is_versioned_and_bounded() {
        assert!(packet(&[]).is_err());
        assert!(packet(&[0; 16]).is_err());
        let mut b = vec![0; 20];
        b[..4].copy_from_slice(b"RVC1");
        b[4..12].copy_from_slice(&42u64.to_le_bytes());
        b[12..16].copy_from_slice(&119u32.to_le_bytes());
        assert_eq!(packet(&b).unwrap(), (42, 119));
    }
    #[test]
    fn stream_limits_reject_before_starting_a_process() {
        let d = tempfile::tempdir().unwrap();
        for (w, h, n) in [
            (0, 128, 1),
            (129, 128, 1),
            (3840, 2160, 1),
            (320, 568, 151),
            (320, 568, 0),
        ] {
            assert!(CaptionStream::start(
                Arc::new(Job::new(0)),
                Path::new("no executable"),
                d.path(),
                w,
                h,
                n
            )
            .is_err());
        }
    }
    #[test]
    fn real_recognition_fixture_retains_token_offsets() {
        let p = transcription::parse_output(
            include_str!("../../tests/fixtures/caption033-whisper.json"),
            4.,
        )
        .unwrap();
        let expected: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/caption033-words.json"))
                .unwrap();
        assert_eq!(serde_json::to_value(p).unwrap(), expected);
    }
    #[test]
    fn style_migration_roundtrip_and_invalid_animation_are_strict() {
        let base: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/smartcut030.json")).unwrap();
        let mut p = base["input"].clone();
        let old = crate::project::parse(&p.to_string()).unwrap();
        assert_eq!(old.schema_version, 15);
        assert!(old.styles["default"].animation.is_none());
        let a = serde_json::json!({"preset":"karaoke-flow","version":1,"accentColor":"#ffe600","speed":1,"intensity":0.8});
        p["styles"]["default"]["animation"] = a.clone();
        assert!(crate::project::parse(&p.to_string()).is_err());
        p["schemaVersion"] = 15.into();
        let read = crate::project::parse(&p.to_string()).unwrap();
        assert_eq!(
            read.styles["default"].animation.as_ref().unwrap().preset,
            "karaoke-flow"
        );
        assert!(crate::project::parse(&serde_json::to_string(&read).unwrap()).is_ok());
        for a in [
            serde_json::Value::Null,
            serde_json::json!({"preset":"shell","version":1,"accentColor":"#ffe600","speed":1,"intensity":1}),
            serde_json::json!({"preset":"pop-beat","version":2,"accentColor":"#ffe600","speed":1,"intensity":1}),
            serde_json::json!({"preset":"pop-beat","version":1,"accentColor":"red","speed":1,"intensity":1}),
        ] {
            p["styles"]["default"]["animation"] = a;
            assert!(crate::project::parse(&p.to_string()).is_err());
        }
    }
}
