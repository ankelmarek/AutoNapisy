//! Session export queue: immutable snapshots, original MLT composition, one final H.264 encode.
use crate::{
    project::{self, Project},
    rendering::{self, Metadata},
    transcription::{self, Job},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    ffi::OsString,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
};
pub const MAX_JOBS: usize = 10;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Options {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub crf: u8,
    pub speed: String,
    pub audio_kbps: u32,
    pub fit: String,
    pub captions: String,
    #[serde(default)]
    pub target_mb: Option<f64>,
}
impl Default for Options {
    fn default() -> Self {
        Self {
            width: None,
            height: None,
            crf: 18,
            speed: "medium".into(),
            audio_kbps: 192,
            fit: "fit".into(),
            captions: "burn".into(),
            target_mb: None,
        }
    }
}
impl Options {
    pub fn validate(&self) -> Result<(), String> {
        if self.width.is_some() != self.height.is_some()
            || self
                .width
                .is_some_and(|w| !(128..=3840).contains(&w) || w % 2 != 0)
            || self
                .height
                .is_some_and(|h| !(128..=3840).contains(&h) || h % 2 != 0)
            || !(12..=35).contains(&self.crf)
            || !["fast", "medium", "slow"].contains(&self.speed.as_str())
            || ![96, 128, 192, 256, 320].contains(&self.audio_kbps)
            || !["fit", "crop"].contains(&self.fit.as_str())
            || !["burn", "srt", "none"].contains(&self.captions.as_str())
            || self
                .target_mb
                .is_some_and(|n| !n.is_finite() || !(0.25..=32000.).contains(&n))
        {
            return Err("Nieprawidłowy profil eksportu".into());
        }
        Ok(())
    }
    pub fn dimensions(&self, meta: &Metadata) -> (u32, u32) {
        (
            self.width.unwrap_or(meta.width),
            self.height.unwrap_or(meta.height),
        )
    }
    pub fn filter(&self, w: u32, h: u32) -> String {
        if self.fit == "crop" {
            format!("scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1")
        } else {
            format!("scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1")
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub options: Options,
}
pub struct Profiles(pub PathBuf);
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Registry {
    version: u32,
    profiles: Vec<Profile>,
}
impl Profiles {
    fn read(&self) -> Result<Vec<Profile>, String> {
        let p = self.0.join("profiles.json");
        if !p.exists() {
            return Ok(vec![]);
        }
        let mut b = Vec::new();
        fs::File::open(p)
            .map_err(|e| e.to_string())?
            .take(1024 * 1024 + 1)
            .read_to_end(&mut b)
            .map_err(|e| e.to_string())?;
        if b.len() > 1024 * 1024 {
            return Err("Rejestr profili przekracza limit".into());
        }
        let r: Registry = serde_json::from_slice(&b).map_err(|_| {
            "Nieczytelne profile. Wyczyść je jawnie albo przywróć kopię.".to_owned()
        })?;
        if ![1, 2].contains(&r.version) {
            return Err("Profile pochodzą z nowszej wersji. Nie zmieniono pliku.".into());
        }
        validate_profiles(&r.profiles)?;
        Ok(r.profiles)
    }
    pub fn list(&self) -> Result<Vec<Profile>, String> {
        self.read()
    }
    pub fn clear(&self) -> Result<(), String> {
        fs::create_dir_all(&self.0).map_err(|e| e.to_string())?;
        let lock = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.0.join("lock"))
            .map_err(|e| e.to_string())?;
        lock.try_lock()
            .map_err(|_| "Profile są używane w innym oknie".to_owned())?;
        match fs::remove_file(self.0.join("profiles.json")) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn update(
        &self,
        profile: Option<Profile>,
        remove: Option<&str>,
    ) -> Result<Vec<Profile>, String> {
        fs::create_dir_all(&self.0).map_err(|e| e.to_string())?;
        let lock = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.0.join("lock"))
            .map_err(|e| e.to_string())?;
        lock.try_lock()
            .map_err(|_| "Profile są używane w innym oknie".to_owned())?;
        let mut rows = self.read()?;
        if let Some(p) = profile {
            rows.retain(|x| x.id != p.id);
            rows.push(p);
        }
        if let Some(id) = remove {
            rows.retain(|p| p.id != id);
        }
        validate_profiles(&rows)?;
        let data = serde_json::to_vec_pretty(&Registry {
            version: 2,
            profiles: rows.clone(),
        })
        .map_err(|e| e.to_string())?;
        let mut tmp = tempfile::NamedTempFile::new_in(&self.0).map_err(|e| e.to_string())?;
        tmp.write_all(&data)
            .and_then(|_| tmp.as_file().sync_all())
            .map_err(|e| e.to_string())?;
        tmp.persist(self.0.join("profiles.json"))
            .map_err(|e| e.to_string())?;
        Ok(rows)
    }
}
fn validate_profiles(rows: &[Profile]) -> Result<(), String> {
    let mut ids = HashSet::new();
    if rows.len() > 24 {
        return Err("Maksymalnie 24 własne profile".into());
    }
    for p in rows {
        if p.id.len() > 64
            || p.id.len() < 8
            || !p.id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            || p.name.trim().is_empty()
            || p.name.len() > 200
            || !ids.insert(&p.id)
        {
            return Err("Nieprawidłowy zapisany profil".into());
        }
        p.options.validate()?;
    }
    Ok(())
}
pub fn file_stem(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(90)
        .collect();
    let s = s.trim().trim_matches('.').trim();
    let base = if s.is_empty() { "Film" } else { s };
    format!("{base}-eksport")
}
pub fn choose_target(
    folder: &Path,
    name: &str,
    reserved: &HashSet<PathBuf>,
) -> Result<PathBuf, String> {
    let stem = file_stem(name);
    for n in 0..10000 {
        let p = folder.join(if n == 0 {
            format!("{stem}.mp4")
        } else {
            format!("{stem}-{n}.mp4")
        });
        if !p.exists() && !p.with_extension("srt").exists() && !reserved.contains(&p) {
            return Ok(p);
        }
    }
    Err("Brak wolnej nazwy eksportu".into())
}
pub fn source_basis(p: &Project, ff: &Path, melt: &Path) -> Result<String, String> {
    let mut paths: Vec<_> = p
        .media
        .iter()
        .map(|m| m.path.as_str())
        .chain(p.assets.iter().map(|a| a.path.as_str()))
        .collect();
    paths.sort_unstable();
    paths.dedup();
    let stamps = paths
        .into_iter()
        .map(|p| crate::proxy::stamp(Path::new(p)))
        .collect::<Result<Vec<_>, _>>()?;
    serde_json::to_string(&(stamps, crate::proxy::stamp(ff)?, crate::proxy::stamp(melt)?))
        .map_err(|e| e.to_string())
}
pub fn metadata(job: &Arc<Job>, ff: &Path, p: &Project, dir: &Path) -> Result<Metadata, String> {
    let path = &p.media.as_ref().ok_or("Projekt wymaga filmu")?.path;
    let mut m = rendering::inspect(job, ff, Path::new(path), dir)?;
    crate::framing::apply_canvas(p, &mut m);
    m.duration = project::composition_duration(p);
    if m.duration <= 0. {
        return Err("Montaż jest pusty".into());
    }
    Ok(m)
}
/// Lossless intermediate avoids encoding the composition as H.264 twice. Timebase remains 30 FPS.
pub(crate) fn assemble(
    job: &Arc<Job>,
    ff: &Path,
    melt: &Path,
    p: &Project,
    meta: &Metadata,
    dir: &Path,
    range: Option<(i64, i64)>,
) -> Result<PathBuf, String> {
    crate::mlt::prepare(job, ff, p, meta, dir, false)?;
    let (first, last) = range.unwrap_or((0, crate::mlt::frame(meta.duration) - 1));
    let out = dir.join("composition.mkv");
    let args: Vec<OsString> = [
        "timeline.mlt".to_string(),
        format!("in={first}"),
        format!("out={last}"),
        "-consumer".into(),
        "avformat:composition.mkv".into(),
        "real_time=-2".into(),
        "terminate_on_pause=1".into(),
        "threads=2".into(),
        "f=matroska".into(),
        "vcodec=ffv1".into(),
        "pix_fmt=yuv420p".into(),
        "acodec=pcm_f32le".into(),
        "mlt_audio_format=f32le".into(),
        "sample_fmt=flt".into(),
        "ar=48000".into(),
        "ac=2".into(),
    ]
    .iter()
    .map(Into::into)
    .collect();
    transcription::run_process_bounded(
        job,
        melt,
        &args,
        dir,
        &out,
        if range.is_some() {
            2 * 1024 * 1024 * 1024
        } else {
            32 * 1024 * 1024 * 1024
        },
    )?;
    Ok(out)
}
pub fn preview(
    job: &Arc<Job>,
    ff: &Path,
    melt: &Path,
    p: &Project,
    o: &Options,
    time: f64,
) -> Result<(Vec<u8>, u32, u32), String> {
    o.validate()?;
    if !time.is_finite() || time < 0. || time > 86400. {
        return Err("Nieprawidłowa pozycja podglądu".into());
    }
    let d = tempfile::tempdir().map_err(|e| e.to_string())?;
    let meta = metadata(job, ff, p, d.path())?;
    let (w, h) = o.dimensions(&meta);
    let f = (400. / w.max(h) as f64).min(1.);
    let (pw, ph) = (
        ((w as f64 * f / 2.).round() as u32 * 2).max(2),
        ((h as f64 * f / 2.).round() as u32 * 2).max(2),
    );
    let mut small = p.clone();
    let scale = (400. / meta.width.max(meta.height) as f64).min(1.);
    let mut m = meta.clone();
    m.width = ((meta.width as f64 * scale / 2.).round() as u32 * 2).max(2);
    m.height = ((meta.height as f64 * scale / 2.).round() as u32 * 2).max(2);
    small.canvas = Some(project::Canvas {
        width: m.width,
        height: m.height,
    });
    let at = crate::mlt::frame(time.min((meta.duration - 1. / 30.).max(0.)));
    let input = assemble(job, ff, melt, &small, &m, d.path(), Some((at, at)))?;
    let out = d.path().join("preview.png");
    let args: Vec<OsString> = ["-v", "error", "-nostdin", "-y", "-i"]
        .iter()
        .map(Into::into)
        .chain(std::iter::once(input.into_os_string()))
        .chain(
            [
                "-an",
                "-frames:v",
                "1",
                "-vf",
                &o.filter(pw, ph),
                "-threads",
                "1",
            ]
            .iter()
            .map(Into::into),
        )
        .chain(std::iter::once(out.clone().into_os_string()))
        .collect();
    transcription::run_process(job, ff, &args, false, d.path())?;
    let bytes = fs::read(out).map_err(|e| e.to_string())?;
    if bytes.len() > 1024 * 1024 {
        return Err("Podgląd przekracza limit".into());
    }
    Ok((bytes, w, h))
}
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: u64,
    pub name: String,
    pub state: String,
    pub message: String,
    pub progress: Option<u8>,
    pub output_path: String,
    pub srt_path: Option<String>,
    pub retryable: bool,
}
struct Uploads {
    received: Vec<bool>,
    bytes: usize,
    ready: bool,
}
pub struct Entry {
    pub id: u64,
    pub project: Project,
    pub options: Options,
    pub meta: Metadata,
    pub target: PathBuf,
    pub ff: PathBuf,
    pub melt: PathBuf,
    pub basis: String,
    pub dir: tempfile::TempDir,
    pub job: Mutex<Arc<Job>>,
    uploads: Mutex<Uploads>,
}
impl Entry {
    pub fn prepare(
        project: Project,
        options: Options,
        folder: &Path,
        ff: PathBuf,
        melt: PathBuf,
        job: Arc<Job>,
    ) -> Result<Self, String> {
        options.validate()?;
        let basis = source_basis(&project, &ff, &melt)?;
        let dir = tempfile::Builder::new()
            .prefix("rolvixa-studio-")
            .tempdir_in(folder)
            .map_err(|e| e.to_string())?;
        let id = job.status.lock().unwrap().id;
        let meta = metadata(&job, &ff, &project, dir.path())?;
        for c in project.clips.as_deref().unwrap_or(&[]) {
            let info = crate::media_sources::inspect(
                &job,
                &ff,
                Path::new(project.clip_path(c).ok_or("Brak źródła")?),
            )?;
            if c.source_out > info.duration + 0.05
                || (c.kind == "video" && info.video_streams == 0)
                || (c.kind == "audio" && info.audio_streams == 0)
            {
                return Err("Ujęcie wymaga niedostępnych klatek lub strumienia źródła".into());
            }
        }
        let count = if options.captions == "burn" {
            project.segments.len()
        } else {
            0
        };
        if count > rendering::MAX_FRAMES {
            return Err("Maksymalnie 3000 plansz napisów".into());
        }
        crate::smart_export::budget(&options, &meta)?;
        let target = choose_target(folder, &project.name, &HashSet::new())?;
        job.status.lock().unwrap().message = "Przygotowywanie plansz…".into();
        let entry = Entry {
            id,
            project,
            options,
            meta,
            target,
            ff,
            melt,
            basis,
            dir,
            job: Mutex::new(job),
            uploads: Mutex::new(Uploads {
                received: vec![false; count],
                bytes: 0,
                ready: false,
            }),
        };
        Ok(entry)
    }
    pub fn select_sample_frames(&self, start: f64, end: f64) -> Vec<usize> {
        let mut u = self.uploads.lock().unwrap();
        let mut indices = Vec::new();
        for (i, received) in u.received.iter_mut().enumerate() {
            let s = &self.project.segments[i];
            if s.end > start && s.start < end {
                indices.push(i);
            } else {
                *received = true;
            }
        }
        indices
    }
    pub fn finish_uploads(&self) -> Result<(), String> {
        self.job.lock().unwrap().check()?;
        let mut u = self.uploads.lock().unwrap();
        if !u.received.iter().all(|v| *v) || u.ready {
            return Err("Plansze nie są gotowe lub zadanie już dodano".into());
        }
        u.ready = true;
        Ok(())
    }
    pub fn item(&self) -> Item {
        let ready = self.uploads.lock().unwrap().ready;
        let job = self.job.lock().unwrap();
        let s = job.status.lock().unwrap();
        Item {
            id: self.id,
            name: self.project.name.clone(),
            state: s.state.clone(),
            message: s.message.clone(),
            progress: s.progress,
            output_path: self.target.to_string_lossy().into(),
            srt_path: (self.options.captions == "srt")
                .then(|| self.target.with_extension("srt").to_string_lossy().into()),
            retryable: ready && ["failed", "cancelled"].contains(&s.state.as_str()),
        }
    }
    pub fn upload(&self, index: usize, bytes: &[u8]) -> Result<(), String> {
        let job = self.job.lock().unwrap().clone();
        job.check()?;
        let mut u = self.uploads.lock().unwrap();
        if u.ready || index >= u.received.len() || u.received[index] {
            return Err("Niepoprawny numer planszy".into());
        }
        if u.bytes + bytes.len() > rendering::MAX_TOTAL_BYTES {
            return Err("Plansze przekroczyły limit 512 MB".into());
        }
        let (w, h) = self.options.dimensions(&self.meta);
        rendering::validate_frame(
            bytes,
            &Metadata {
                width: w,
                height: h,
                ..self.meta.clone()
            },
        )?;
        fs::write(self.dir.path().join(rendering::frame_name(index)), bytes)
            .map_err(|e| e.to_string())?;
        u.bytes += bytes.len();
        u.received[index] = true;
        let mut s = job.status.lock().unwrap();
        s.message = format!(
            "Plansze: {} / {}",
            u.received.iter().filter(|v| **v).count(),
            u.received.len()
        );
        s.progress =
            Some((u.received.iter().filter(|v| **v).count() * 100 / u.received.len().max(1)) as u8);
        Ok(())
    }
}
#[derive(Default)]
pub struct Queue {
    pub entries: Mutex<Vec<Arc<Entry>>>,
    sequence: AtomicU64,
    running: AtomicBool,
    stopped: AtomicBool,
    workers: Mutex<Vec<std::thread::JoinHandle<()>>>,
}
impl Queue {
    pub fn list(&self) -> Vec<Item> {
        self.entries
            .lock()
            .unwrap()
            .iter()
            .map(|e| e.item())
            .collect()
    }
    pub fn get(&self, id: u64) -> Result<Arc<Entry>, String> {
        self.entries
            .lock()
            .unwrap()
            .iter()
            .find(|e| e.id == id)
            .cloned()
            .ok_or("Nieznane zadanie eksportu".into())
    }
    pub fn prepare(
        &self,
        project: Project,
        options: Options,
        folder: &Path,
        ff: PathBuf,
        melt: PathBuf,
    ) -> Result<Arc<Entry>, String> {
        let id = self.sequence.fetch_add(1, Ordering::SeqCst) + 1;
        let mut entry = Entry::prepare(project, options, folder, ff, melt, Arc::new(Job::new(id)))?;
        let mut entries = self.entries.lock().unwrap();
        if entries.len() >= MAX_JOBS {
            return Err("Kolejka ma maksymalnie 10 zadań. Usuń zakończone pozycje.".into());
        }
        entry.target = choose_target(
            folder,
            &entry.project.name,
            &entries.iter().map(|e| e.target.clone()).collect(),
        )?;
        let entry = Arc::new(entry);
        entries.push(entry.clone());
        Ok(entry)
    }
    pub fn ready(self: &Arc<Self>, id: u64) -> Result<(), String> {
        let e = self.get(id)?;
        let job = e.job.lock().unwrap().clone();
        job.check()?;
        e.finish_uploads()?;
        {
            let mut s = job.status.lock().unwrap();
            s.state = "queued".into();
            s.message = "W kolejce".into();
            s.progress = None;
        }
        self.kick();
        Ok(())
    }
    pub fn cancel(&self, id: u64) -> Result<(), String> {
        let e = self.get(id)?;
        let job = e.job.lock().unwrap().clone();
        let waiting = ["queued", "preparing"].contains(&job.status.lock().unwrap().state.as_str());
        job.cancel();
        let mut s = job.status.lock().unwrap();
        if waiting {
            s.state = "cancelled".into();
            s.message = "Anulowano eksport".into();
        }
        Ok(())
    }
    pub fn retry(self: &Arc<Self>, id: u64) -> Result<(), String> {
        let rows = self.entries.lock().unwrap();
        let e = rows
            .iter()
            .find(|e| e.id == id)
            .cloned()
            .ok_or("Nieznane zadanie")?;
        let item = e.item();
        if !item.retryable {
            return Err("Zadanie nie może być ponowione. Dodaj projekt ponownie.".into());
        }
        if e.target.exists()
            || e.options.captions == "srt" && e.target.with_extension("srt").exists()
        {
            return Err("Plik docelowy już istnieje. Dodaj zadanie z nową nazwą.".into());
        }
        let job = Arc::new(Job::new(id));
        {
            let mut s = job.status.lock().unwrap();
            s.state = "queued".into();
            s.message = "Ponowiono · w kolejce".into();
        }
        *e.job.lock().unwrap() = job;
        drop(rows);
        self.kick();
        Ok(())
    }
    pub fn remove(&self, id: u64) -> Result<(), String> {
        let mut entries = self.entries.lock().unwrap();
        let e = entries
            .iter()
            .find(|e| e.id == id)
            .ok_or("Nieznane zadanie")?;
        let active = e.job.lock().unwrap().active();
        if active || e.item().state == "queued" {
            return Err("Najpierw anuluj zadanie".into());
        }
        entries.retain(|e| e.id != id);
        Ok(())
    }
    fn kick(self: &Arc<Self>) {
        let q = self.clone();
        if q.running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }
        let h = std::thread::spawn(move || loop {
            let next = {
                let rows = q.entries.lock().unwrap();
                let e = if q.stopped.load(Ordering::SeqCst) {
                    None
                } else {
                    rows.iter()
                        .find(|e| e.job.lock().unwrap().status.lock().unwrap().state == "queued")
                        .cloned()
                };
                if let Some(e) = &e {
                    e.job.lock().unwrap().status.lock().unwrap().state = "rendering".into();
                } else {
                    q.running.store(false, Ordering::SeqCst);
                }
                e
            };
            let Some(e) = next else { break };
            let job = e.job.lock().unwrap().clone();
            if let Err(error) = render(&e, &job) {
                let mut s = job.status.lock().unwrap();
                if s.state != "completed" {
                    s.state = if job.cancel.load(Ordering::SeqCst) {
                        "cancelled"
                    } else {
                        "failed"
                    }
                    .into();
                    s.message = error;
                    s.progress = None;
                }
            }
        });
        self.workers.lock().unwrap().push(h);
    }
    pub fn shutdown(&self) {
        self.stopped.store(true, Ordering::SeqCst);
        for e in self.entries.lock().unwrap().iter() {
            e.job.lock().unwrap().cancel();
        }
        for w in self.workers.lock().unwrap().drain(..) {
            let _ = w.join();
        }
    }
}
fn publish(from: &Path, to: &Path) -> Result<(), String> {
    fs::OpenOptions::new()
        .write(true)
        .open(from)
        .and_then(|f| f.sync_all())
        .map_err(|e| e.to_string())?;
    publish_new(from, to).map_err(|e| {
        format!(
            "Nie można zapisać {}: {e}. Cel nie jest nadpisywany.",
            to.display()
        )
    })
}
#[cfg(not(windows))]
fn publish_new(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::hard_link(from, to)
}
#[cfg(windows)]
fn publish_new(from: &Path, to: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(from: *const u16, to: *const u16, flags: u32) -> i32;
    }
    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    // WRITE_THROUGH, deliberately without REPLACE_EXISTING. Works on NTFS and exFAT.
    if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), 8) } != 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}
fn render(e: &Entry, job: &Arc<Job>) -> Result<(), String> {
    if source_basis(&e.project, &e.ff, &e.melt)? != e.basis {
        return Err(
            "Źródła lub narzędzia zmieniły się od dodania zadania. Dodaj projekt ponownie.".into(),
        );
    }
    let dir = tempfile::Builder::new()
        .prefix("attempt-")
        .tempdir_in(e.dir.path())
        .map_err(|e| e.to_string())?;
    {
        let mut s = job.status.lock().unwrap();
        s.message = "Składanie obrazu i miksu · MLT".into();
        s.progress = None;
    }
    let assembled = assemble(job, &e.ff, &e.melt, &e.project, &e.meta, dir.path(), None)?;
    crate::smart_export::encode(
        e,
        job,
        &e.options,
        &assembled,
        dir.path(),
        0.,
        e.meta.duration,
        32 * 1024 * 1024 * 1024,
    )?;
    job.check()?;
    if source_basis(&e.project, &e.ff, &e.melt)? != e.basis {
        return Err("Źródło zmieniło się podczas eksportu. Wynik nie został opublikowany.".into());
    }
    let mut s = job.status.lock().unwrap();
    if job.cancel.load(Ordering::SeqCst) {
        return Err("Anulowano eksport".into());
    }
    let srt = e.target.with_extension("srt");
    let mut published_srt = None;
    if e.options.captions == "srt" {
        let temp = dir.path().join("result.srt");
        fs::write(&temp, crate::subtitles::to_srt(&e.project.segments)?)
            .map_err(|e| e.to_string())?;
        // Capture our file before publication; never adopt a replacement's fingerprint.
        let stamp = rendering::fingerprint(&temp)?;
        publish(&temp, &srt)?;
        published_srt = Some(stamp);
    }
    if let Err(err) = publish(&dir.path().join("result.mp4"), &e.target) {
        if let Some(stamp) = published_srt {
            if rendering::fingerprint(&srt).ok() == Some(stamp) {
                let _ = fs::remove_file(&srt);
            }
        }
        return Err(err);
    }
    s.state = "completed".into();
    s.message = "Eksport zakończony".into();
    s.progress = Some(100);
    s.output_path = Some(e.target.to_string_lossy().into());
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_options_cannot_inject_encoders_or_dimensions() {
        let good = Options::default();
        assert!(good.validate().is_ok());
        for bad in [
            Options {
                width: Some(1081),
                height: Some(1920),
                ..good.clone()
            },
            Options {
                width: Some(1280),
                ..good.clone()
            },
            Options {
                speed: "medium;cmd".into(),
                ..good.clone()
            },
            Options {
                audio_kbps: 999,
                ..good.clone()
            },
            Options {
                captions: "mov_text".into(),
                ..good.clone()
            },
            Options {
                crf: 0,
                ..good.clone()
            },
        ] {
            assert!(bad.validate().is_err());
        }
    }
    #[test]
    fn filenames_are_unicode_but_not_paths_and_never_overwrite() {
        let d = tempfile::tempdir().unwrap();
        let a = choose_target(d.path(), "Zażółć /../ CON", &HashSet::new()).unwrap();
        assert_eq!(a.parent(), Some(d.path()));
        assert!(a.file_name().unwrap().to_str().unwrap().contains("Zażółć"));
        fs::write(&a, b"source").unwrap();
        let b = choose_target(d.path(), "Zażółć /../ CON", &HashSet::new()).unwrap();
        assert_ne!(a, b);
        assert_eq!(fs::read(&a).unwrap(), b"source");
        let reserved = HashSet::from([b.clone()]);
        assert_ne!(
            choose_target(d.path(), "Zażółć /../ CON", &reserved).unwrap(),
            b
        );
    }
    #[test]
    fn profile_registry_roundtrip_isolated_updates_and_delete() {
        let d = tempfile::tempdir().unwrap();
        let store = Profiles(d.path().join("profile Łódź"));
        let profile = |id: &str, name: &str| Profile {
            id: id.into(),
            name: name.into(),
            options: Options::default(),
        };
        store
            .update(Some(profile("profile-1", "Zażółć")), None)
            .unwrap();
        store
            .update(Some(profile("profile-2", "Drugi")), None)
            .unwrap();
        assert_eq!(store.list().unwrap().len(), 2);
        store
            .update(Some(profile("profile-1", "Pierwszy")), None)
            .unwrap();
        assert_eq!(store.list().unwrap().len(), 2);
        store.update(None, Some("profile-2")).unwrap();
        assert_eq!(store.list().unwrap()[0].name, "Pierwszy");
    }
    #[test]
    fn v1_profiles_migrate_on_write_without_changing_crf_or_project_data() {
        let d = tempfile::tempdir().unwrap();
        let store = Profiles(d.path().into());
        let mut options = serde_json::to_value(Options::default()).unwrap();
        options.as_object_mut().unwrap().remove("targetMb");
        let old = serde_json::json!({"version":1,"profiles":[{"id":"legacy-profile","name":"Próba Łódź","options":options}]});
        fs::write(d.path().join("profiles.json"), old.to_string()).unwrap();
        let rows = store.list().unwrap();
        assert_eq!(rows[0].options.target_mb, None);
        assert_eq!(rows[0].options.crf, 18);
        let unchanged = fs::read_to_string(d.path().join("profiles.json")).unwrap();
        assert_eq!(unchanged, old.to_string());
        store.update(None, None).unwrap();
        let data: serde_json::Value =
            serde_json::from_slice(&fs::read(d.path().join("profiles.json")).unwrap()).unwrap();
        assert_eq!(data["version"], 2);
        assert_eq!(data["profiles"][0]["options"]["crf"], 18);
    }
    #[test]
    fn corrupt_future_and_locked_profiles_are_preserved() {
        let d = tempfile::tempdir().unwrap();
        let store = Profiles(d.path().into());
        let file = d.path().join("profiles.json");
        for bytes in [b"bad".to_vec(), br#"{"version":99,"profiles":[]}"#.to_vec()] {
            fs::write(&file, &bytes).unwrap();
            assert!(store.update(None, None).is_err());
            assert_eq!(fs::read(&file).unwrap(), bytes);
        }
        store.clear().unwrap();
        let lock = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(d.path().join("lock"))
            .unwrap();
        lock.lock().unwrap();
        assert!(store.update(None, None).is_err());
        assert!(store.clear().is_err());
    }
    #[test]
    fn publication_refuses_raced_destination() {
        let d = tempfile::tempdir().unwrap();
        let temp = d.path().join("temp");
        let target = d.path().join("out.mp4");
        fs::write(&temp, b"ours").unwrap();
        fs::write(&target, b"external").unwrap();
        assert!(publish(&temp, &target).is_err());
        assert_eq!(fs::read(target).unwrap(), b"external");
    }
    #[test]
    fn output_mapping_keeps_aspect_and_has_no_stretch() {
        let o = Options {
            width: Some(1080),
            height: Some(1920),
            ..Default::default()
        };
        assert!(o
            .filter(1080, 1920)
            .contains("force_original_aspect_ratio=decrease"));
        assert!(o.filter(1080, 1920).contains("pad=1080:1920"));
        assert!(Options {
            fit: "crop".into(),
            ..o
        }
        .filter(1080, 1920)
        .contains("crop=1080:1920"));
    }
}
