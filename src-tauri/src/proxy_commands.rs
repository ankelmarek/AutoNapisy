use crate::{
    commands::ToolState,
    media_path, path_string,
    proxy::{self, Info, Manifest, Stamp},
    transcription::{validate_tool, Job},
    Access,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, RwLock},
};
use tauri::{Manager, State};
struct Entry {
    source: Stamp,
    info: Info,
    manifest: Option<Manifest>,
    enabled: bool,
    profile: u32,
    job: Option<Arc<Job>>,
    message: String,
}
#[derive(Default)]
pub struct ProxyState {
    root: Mutex<Option<PathBuf>>,
    entries: Arc<Mutex<HashMap<String, Entry>>>,
    aliases: Mutex<HashMap<String, String>>,
    owner: Mutex<Option<CacheOwner>>,
    error: Mutex<String>,
    gate: Arc<Mutex<()>>,
    pub lease: Arc<RwLock<()>>,
    workers: Mutex<Vec<(Arc<Job>, std::thread::JoinHandle<()>)>>,
}
struct CacheOwner {
    path: PathBuf,
    _file: std::fs::File,
}
impl Drop for CacheOwner {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}
#[derive(Clone)]
pub struct ProxyView {
    entries: Arc<Mutex<HashMap<String, Entry>>>,
    pub lease: Arc<RwLock<()>>,
}
impl ProxyView {
    pub fn project(&self, p: &crate::project::Project) -> crate::project::Project {
        let mut paths = HashMap::new();
        let mut entries = self.entries.lock().unwrap();
        for (original, e) in entries.iter_mut() {
            if !e.enabled {
                continue;
            }
            if let Some(m) = &e.manifest {
                if proxy::unchanged(&m.source) && proxy::unchanged(&m.output) {
                    paths.insert(original.clone(), m.output.path.clone());
                } else {
                    e.manifest = None;
                    e.message =
                        "Źródło lub proxy zmieniło się. Podgląd korzysta z oryginału.".into();
                }
            }
        }
        proxy::substitute(p, &paths)
    }
}
impl ProxyState {
    pub fn view(&self) -> ProxyView {
        ProxyView {
            entries: self.entries.clone(),
            lease: self.lease.clone(),
        }
    }
    pub fn initialize(&self, app: &tauri::AppHandle) -> Result<(), String> {
        let root = app
            .path()
            .app_cache_dir()
            .map_err(|e| e.to_string())?
            .join("video-proxy-v1");
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let path = root.join("owner.lock");
        if path.exists() {
            let mut raw = String::new();
            if let Ok(file) = std::fs::File::open(&path) {
                let _ = file.take(64).read_to_string(&mut raw);
            }
            let alive = match raw.trim().parse::<u32>() {
                Ok(pid) => sysinfo::System::new_all()
                    .process(sysinfo::Pid::from_u32(pid))
                    .is_some(),
                Err(_) => std::fs::metadata(&path)
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.elapsed().ok())
                    .map_or(true, |age| age.as_secs() < 30),
            };
            if !alive {
                let _ = std::fs::remove_file(&path);
            }
        }
        let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e|format!("Cache proxy jest zajęty przez inną instancję lub niedostępny: {e}. Można pracować na oryginałach."))?;
        write!(file, "{}", std::process::id()).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        *self.owner.lock().unwrap() = Some(CacheOwner { path, _file: file });
        *self.root.lock().unwrap() = Some(root);
        Ok(())
    }
    pub fn record_error(&self, error: String) {
        *self.error.lock().unwrap() = error;
    }
    fn root(&self) -> Result<PathBuf, String> {
        self.root.lock().unwrap().clone().ok_or_else(|| {
            let e = self.error.lock().unwrap();
            if e.is_empty() {
                "Cache proxy jest niedostępny".into()
            } else {
                e.clone()
            }
        })
    }
    pub fn shutdown(&self) {
        let mut workers = self.workers.lock().unwrap();
        for (j, _) in workers.iter() {
            j.cancel();
        }
        for (_, h) in workers.drain(..) {
            let _ = h.join();
        }
    }
}
fn authorized(path: &str, access: &Access) -> Result<PathBuf, String> {
    let p = media_path(Path::new(path))?;
    if !access.0.lock().map_err(|_| "Błąd uprawnień")?.contains(&p) {
        return Err("Najpierw zaimportuj film lub otwórz projekt".into());
    }
    Ok(p)
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    path: String,
    status: String,
    progress: Option<u8>,
    message: String,
    enabled: bool,
    profile: u32,
    preview_path: Option<String>,
    source_key: String,
    info: Info,
    recommended: bool,
}
fn snapshot(path: &str, e: &Entry, app: &tauri::AppHandle) -> Result<Snapshot, String> {
    let status = e.job.as_ref().map(|j| j.status.lock().unwrap().clone());
    let running = status
        .as_ref()
        .is_some_and(|s| ["preparing", "rendering", "cancelling"].contains(&s.state.as_str()));
    let failed = status.as_ref().is_some_and(|s| s.state == "failed");
    let ready = e
        .manifest
        .as_ref()
        .filter(|m| proxy::unchanged(&m.source) && proxy::unchanged(&m.output));
    let stale = e.manifest.is_some() && ready.is_none() || !proxy::unchanged(&e.source);
    let preview_path = if e.enabled {
        ready.map(|m| m.output.path.clone())
    } else {
        None
    };
    if let Some(path) = &preview_path {
        app.asset_protocol_scope()
            .allow_file(path)
            .map_err(|e| e.to_string())?;
    }
    Ok(Snapshot {
        path: path.into(),
        source_key: proxy::key(&e.source, e.profile),
        status: if running {
            if status.as_ref().unwrap().state == "preparing" {
                "queued"
            } else {
                "building"
            }
        } else if failed || stale || !e.message.is_empty() {
            "error"
        } else if ready.is_some() {
            "ready"
        } else {
            "original"
        }
        .into(),
        progress: status.as_ref().and_then(|s| s.progress),
        message: if running || failed {
            status
                .as_ref()
                .map(|s| s.message.clone())
                .unwrap_or_default()
        } else if stale {
            "Źródło lub proxy zmieniło się. Odtwarzanie z oryginału; ponów przygotowanie proxy."
                .into()
        } else {
            e.message.clone()
        },
        enabled: e.enabled,
        profile: if running {
            e.profile
        } else {
            ready.map(|m| m.profile).unwrap_or(e.profile)
        },
        preview_path,
        info: e.info.clone(),
        recommended: e.info.recommended(),
    })
}
#[tauri::command]
pub async fn proxy_info(
    path: String,
    app: tauri::AppHandle,
    access: State<'_, Access>,
    tools: State<'_, ToolState>,
    state: State<'_, ProxyState>,
) -> Result<Snapshot, String> {
    let source = authorized(&path, &access)?;
    let original = path_string(&source)?;
    state
        .aliases
        .lock()
        .unwrap()
        .insert(path.clone(), original.clone());
    let root = state.root()?;
    let entries = state.entries.clone();
    let ffmpeg = {
        let t = tools.0.lock().unwrap();
        validate_tool("ffmpeg", t.ffmpeg.as_deref().ok_or("Wskaż FFmpeg")?)?
    };
    tauri::async_runtime::spawn_blocking(move || {
        let stamp = proxy::stamp(&source)?;
        {
            let map = entries.lock().unwrap();
            if let Some(e) = map.get(&original) {
                if e.source == stamp {
                    return snapshot(&path, e, &app);
                }
            }
        }
        let job = Arc::new(Job::new(0));
        let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
        let cached =
            proxy::cached(&root, &stamp, 540).or_else(|| proxy::cached(&root, &stamp, 720));
        let info = if let Some(m) = &cached {
            m.info.clone()
        } else {
            proxy::inspect(&job, &ffmpeg, &source, dir.path())?
        };
        let profile = cached.as_ref().map(|m| m.profile).unwrap_or(540);
        let mut map = entries.lock().unwrap();
        if let Some(e) = map.get(&original) {
            if let Some(j) = &e.job {
                j.cancel();
            }
        }
        map.insert(
            original.clone(),
            Entry {
                source: stamp,
                info,
                manifest: cached,
                enabled: true,
                profile,
                job: None,
                message: String::new(),
            },
        );
        snapshot(&path, &map[&original], &app)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn proxy_status(
    paths: Vec<String>,
    app: tauri::AppHandle,
    access: State<'_, Access>,
    state: State<'_, ProxyState>,
) -> Result<Vec<Snapshot>, String> {
    if paths.len() > 100 {
        return Err("Maksymalnie 100 źródeł".into());
    }
    let mut result = vec![];
    for path in paths {
        let original = match authorized(&path, &access) {
            Ok(p) => path_string(&p)?,
            Err(_) => {
                let alias = state
                    .aliases
                    .lock()
                    .unwrap()
                    .get(&path)
                    .cloned()
                    .unwrap_or_else(|| path.clone());
                let entries = state.entries.lock().unwrap();
                if let Some(e) = entries.get(&alias) {
                    let mut s = snapshot(&path, e, &app)?;
                    s.status = "error".into();
                    s.message="Brak oryginalnego źródła. Przywróć plik, aby kontynuować montaż i eksport.".into();
                    s.preview_path = None;
                    s.enabled = false;
                    result.push(s);
                }
                continue;
            }
        };
        let entries = state.entries.lock().unwrap();
        if let Some(e) = entries.get(&original) {
            result.push(snapshot(&path, e, &app)?);
        }
    }
    Ok(result)
}
#[tauri::command]
pub fn start_proxy(
    path: String,
    profile: u32,
    access: State<'_, Access>,
    tools: State<'_, ToolState>,
    state: State<'_, ProxyState>,
) -> Result<(), String> {
    if ![540, 720].contains(&profile) {
        return Err("Wybierz profil 540p lub 720p".into());
    }
    let source = authorized(&path, &access)?;
    let original = path_string(&source)?;
    let root = state.root()?;
    let ffmpeg = {
        let t = tools.0.lock().unwrap();
        validate_tool("ffmpeg", t.ffmpeg.as_deref().ok_or("Wskaż FFmpeg")?)?
    };
    let job = Arc::new(Job::new(0));
    let (stamp, info) = {
        let mut entries = state.entries.lock().unwrap();
        let e = entries
            .get_mut(&original)
            .ok_or("Najpierw odczytaj informacje o filmie")?;
        if !proxy::unchanged(&e.source) {
            return Err("Źródło zmieniło się. Odśwież informacje o pliku.".into());
        }
        if e.info.hdr {
            return Err(
                "Profil proxy obsługuje SDR. Ten materiał HDR pozostaje na oryginale.".into(),
            );
        }
        if e.job.as_ref().is_some_and(|j| j.active()) {
            return Err("Proxy jest już w kolejce".into());
        }
        e.job = Some(job.clone());
        e.profile = profile;
        e.enabled = true;
        e.message.clear();
        job.status.lock().unwrap().message = "Proxy oczekuje w kolejce…".into();
        (e.source.clone(), e.info.clone())
    };
    let entries = state.entries.clone();
    let gate = state.gate.clone();
    let lease = state.lease.clone();
    let running = job.clone();
    let worker = std::thread::Builder::new()
        .name("rolvixa-proxy".into())
        .spawn(move || {
            let result = (|| {
                let _gate = loop {
                    running.check()?;
                    match gate.try_lock() {
                        Ok(g) => break g,
                        Err(std::sync::TryLockError::WouldBlock) => {
                            std::thread::sleep(std::time::Duration::from_millis(40))
                        }
                        Err(_) => return Err("Błąd kolejki proxy".into()),
                    }
                };
                running.check()?;
                let _lease = lease.read().map_err(|_| "Błąd cache proxy")?;
                if let Some(m) = proxy::cached(&root, &stamp, profile) {
                    return Ok(m);
                }
                let disks = sysinfo::Disks::new_with_refreshed_list();
                let available = disks
                    .iter()
                    .filter(|d| root.starts_with(d.mount_point()))
                    .max_by_key(|d| d.mount_point().as_os_str().len())
                    .map(|d| d.available_space().saturating_sub(64 * 1024 * 1024))
                    .unwrap_or(proxy::CACHE_LIMIT);
                let budget = proxy::CACHE_LIMIT
                    .saturating_sub(proxy::cache_bytes(&root))
                    .min(4 * 1024 * 1024 * 1024)
                    .min(available);
                proxy::generate(&running, &ffmpeg, &root, &stamp, &info, profile, budget)
            })();
            let mut entries = entries.lock().unwrap();
            let mut status = running.status.lock().unwrap();
            match result {
                Ok(m) if !running.cancel.load(std::sync::atomic::Ordering::SeqCst) => {
                    if let Some(e) = entries.get_mut(&original) {
                        if e.source == stamp {
                            e.manifest = Some(m);
                            e.message.clear();
                        }
                    }
                    status.state = "completed".into();
                    status.progress = Some(100);
                    status.message = "Proxy gotowe".into();
                }
                Err(e) if !running.cancel.load(std::sync::atomic::Ordering::SeqCst) => {
                    status.state = "failed".into();
                    status.message = e;
                }
                _ => {
                    status.state = "cancelled".into();
                    status.message = "Anulowano przygotowanie proxy".into();
                }
            }
        })
        .map_err(|e| {
            let mut s = job.status.lock().unwrap();
            s.state = "failed".into();
            s.message = e.to_string();
            e.to_string()
        })?;
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
    Ok(())
}
#[tauri::command]
pub fn cancel_proxy(
    path: String,
    access: State<'_, Access>,
    state: State<'_, ProxyState>,
) -> Result<(), String> {
    let path = path_string(&authorized(&path, &access)?)?;
    if let Some(e) = state.entries.lock().unwrap().get(&path) {
        if let Some(j) = &e.job {
            j.cancel();
        }
    }
    Ok(())
}
#[tauri::command]
pub fn set_proxy_enabled(
    path: String,
    enabled: bool,
    access: State<'_, Access>,
    state: State<'_, ProxyState>,
) -> Result<(), String> {
    let path = path_string(&authorized(&path, &access)?)?;
    let mut entries = state.entries.lock().unwrap();
    let e = entries
        .get_mut(&path)
        .ok_or("Najpierw odczytaj informacje o pliku")?;
    e.enabled = enabled;
    Ok(())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheInfo {
    bytes: u64,
    limit: u64,
    path: String,
}
#[tauri::command]
pub fn proxy_cache_info(state: State<'_, ProxyState>) -> Result<CacheInfo, String> {
    let root = state.root()?;
    Ok(CacheInfo {
        bytes: proxy::cache_bytes(&root),
        limit: proxy::CACHE_LIMIT,
        path: path_string(&root)?,
    })
}
#[tauri::command]
pub fn clear_proxy_cache(state: State<'_, ProxyState>) -> Result<(), String> {
    let _lease = state
        .lease
        .try_write()
        .map_err(|_| "Zatrzymaj podgląd i przygotowanie proxy przed czyszczeniem cache")?;
    let mut entries = state.entries.lock().unwrap();
    if entries
        .values()
        .any(|e| e.job.as_ref().is_some_and(|j| j.active()))
    {
        return Err("Najpierw anuluj zadania proxy".into());
    }
    let root = state.root()?;
    for entry in std::fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            std::fs::remove_dir_all(entry.path())
                .map_err(|e| format!("Nie można wyczyścić cache: {e}"))?;
        }
    }
    for e in entries.values_mut() {
        e.manifest = None;
        e.job = None;
        e.message.clear();
    }
    Ok(())
}
