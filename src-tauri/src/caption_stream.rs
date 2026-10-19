//! Bounded binary RGBA -> lossless alpha video. At most one queued frame plus one writer frame.
use crate::transcription::{self, Job};
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    sync::{
        mpsc::{sync_channel, SyncSender},
        Arc, Mutex,
    },
    thread::JoinHandle,
};
pub const MAX_PIXELS: u32 = 1280 * 1280;
pub const MAX_FRAMES: usize = 150;
pub const MAX_BYTES: u64 = 1024 * 1024 * 1024;
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
        if width < 128
            || height < 128
            || width % 2 != 0
            || height % 2 != 0
            || width.checked_mul(height).is_none_or(|n| n > MAX_PIXELS)
            || frames == 0
            || frames > MAX_FRAMES
        {
            return Err("POC napisów: maks. 1280² pikseli i 150 klatek".into());
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
                transcription::run_process_stream(&running, &ff, &args, &dir, &out, MAX_BYTES, rx)
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
            > MAX_BYTES
        {
            return Err("Warstwa przekracza 1 GiB".into());
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
    if bytes.len() < 16 || bytes.len() > 16 + MAX_PIXELS as usize * 4 || &bytes[..4] != b"RVC1" {
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
        let base:serde_json::Value=serde_json::from_str(include_str!("../../tests/fixtures/smartcut030.json")).unwrap();
        let mut p=base["input"].clone();
        let old=crate::project::parse(&p.to_string()).unwrap();assert_eq!(old.schema_version,15);assert!(old.styles["default"].animation.is_none());
        let a=serde_json::json!({"preset":"karaoke-flow","version":1,"accentColor":"#ffe600","speed":1,"intensity":0.8});
        p["styles"]["default"]["animation"]=a.clone();assert!(crate::project::parse(&p.to_string()).is_err());
        p["schemaVersion"]=15.into();let read=crate::project::parse(&p.to_string()).unwrap();assert_eq!(read.styles["default"].animation.as_ref().unwrap().preset,"karaoke-flow");assert!(crate::project::parse(&serde_json::to_string(&read).unwrap()).is_ok());
        for a in [serde_json::Value::Null,serde_json::json!({"preset":"shell","version":1,"accentColor":"#ffe600","speed":1,"intensity":1}),serde_json::json!({"preset":"pop-beat","version":2,"accentColor":"#ffe600","speed":1,"intensity":1}),serde_json::json!({"preset":"pop-beat","version":1,"accentColor":"red","speed":1,"intensity":1})] {p["styles"]["default"]["animation"]=a;assert!(crate::project::parse(&p.to_string()).is_err());}
    }
}
