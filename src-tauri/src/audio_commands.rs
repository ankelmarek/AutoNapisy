use crate::{
    audio_library::{self, AudioItem, RemoteAudio, SearchPage},
    commands::ToolState,
    media_path, path_string,
    project::Provenance,
    transcription::{validate_tool, Job},
    Access,
};
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{Manager, State};
#[derive(Default)]
pub struct AudioLibraryState {
    entries: Arc<Mutex<HashMap<String, RemoteAudio>>>,
    last_search: Mutex<Option<Instant>>,
    jobs: Arc<Mutex<Vec<Arc<Job>>>>,
    gate: Arc<Mutex<()>>,
}
impl AudioLibraryState {
    pub fn shutdown(&self) {
        for job in self.jobs.lock().unwrap().iter() {
            job.cancel();
        }
    }
    fn job(&self) -> Result<Arc<Job>, String> {
        let mut jobs = self.jobs.lock().unwrap();
        jobs.retain(|j| j.active());
        if jobs.len() > 8 {
            return Err("Biblioteka audio jest zajęta".into());
        }
        let job = Arc::new(Job::new(0));
        jobs.push(job.clone());
        Ok(job)
    }
}
fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("RolVixa/0.12 (+https://github.com/ankelmarek/AutoNapisy)")
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                attempt.error("Zbyt wiele przekierowań")
            } else if public_url(attempt.url()).is_ok() {
                attempt.follow()
            } else {
                attempt.error("Nieprawidłowy adres audio")
            }
        }))
        .build()
        .map_err(|e| e.to_string())
}
fn public_url(url: &reqwest::Url) -> Result<(), String> {
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err("Dozwolone są tylko publiczne adresy HTTPS".into());
    }
    let host = url.host_str().ok_or("Brak adresu serwera")?;
    if host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.parse::<std::net::IpAddr>().is_ok()
    {
        return Err("Nieprawidłowy serwer audio".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn search_audio(
    query: String,
    page: u32,
    license: String,
    state: State<'_, AudioLibraryState>,
) -> Result<SearchPage, String> {
    let query = query.trim().to_owned();
    if query.chars().count() < 2 || query.chars().count() > 200 || !(1..=20).contains(&page) {
        return Err("Wpisz od 2 do 200 znaków wyszukiwania".into());
    }
    if !["commercial", "cc0", "all"].contains(&license.as_str()) {
        return Err("Nieprawidłowy filtr licencji".into());
    }
    {
        let mut last = state.last_search.lock().unwrap();
        if last.is_some_and(|t| t.elapsed() < Duration::from_millis(1500)) {
            return Err("Poczekaj chwilę przed kolejnym wyszukiwaniem".into());
        }
        *last = Some(Instant::now());
    }
    let entries = state.entries.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let client = client()?;
        let mut request = client.get("https://api.openverse.org/v1/audio/").query(&[
            ("q", query),
            ("page", page.to_string()),
            ("page_size", "20".into()),
            ("category", "music".into()),
            ("filter_dead", "true".into()),
        ]);
        request = match license.as_str() {
            "cc0" => request.query(&[("license", "cc0")]),
            "commercial" => request.query(&[("license_type", "commercial,modification")]),
            _ => request,
        };
        let response = request
            .send()
            .map_err(|e| format!("Nie można połączyć się z Openverse: {e}"))?;
        if !response.status().is_success() {
            return Err(match response.status().as_u16() {
                403 => {
                    "Openverse odrzuciło połączenie (403). Spróbuj później lub użyj własnego audio."
                        .into()
                }
                429 => "Limit wyszukiwania Openverse. Poczekaj chwilę i spróbuj ponownie.".into(),
                code => format!("Openverse: błąd serwera {code}"),
            });
        }
        let mut data = vec![];
        response
            .take(2 * 1024 * 1024 + 1)
            .read_to_end(&mut data)
            .map_err(|e| e.to_string())?;
        let result = audio_library::parse_search(&data)?;
        let mut map = entries.lock().unwrap();
        if map.len() > 200 {
            map.clear();
        }
        for r in &result.results {
            map.insert(r.id.clone(), r.clone());
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[derive(serde::Deserialize)]
struct Builtin {
    id: String,
    name: String,
    group: String,
    file: String,
    duration: f64,
}
#[tauri::command]
pub fn builtin_audio(
    app: tauri::AppHandle,
    access: State<'_, Access>,
) -> Result<Vec<AudioItem>, String> {
    let root = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("vendor/audio");
    let data = std::fs::read(root.join("catalog.json")).map_err(|_| {
        "Brakuje pakietu dźwięków Kenney. Zainstaluj pełną wersję RolVixa.".to_string()
    })?;
    if data.len() > 1024 * 1024 {
        return Err("Nieprawidłowy katalog dźwięków".into());
    }
    let catalog: Vec<Builtin> = serde_json::from_slice(&data).map_err(|e| e.to_string())?;
    if catalog.len() > 200 {
        return Err("Nieprawidłowy katalog Kenney".into());
    }
    let mut result = vec![];
    for c in catalog {
        if !c.file.ends_with(".wav")
            || c.file.contains(['\\', '/'])
            || !c.duration.is_finite()
            || !(0.05..=60.).contains(&c.duration)
        {
            return Err("Nieprawidłowy dźwięk Kenney".into());
        }
        let path = media_path(&root.join(&c.file))?;
        access.0.lock().unwrap().insert(path.clone());
        app.asset_protocol_scope()
            .allow_file(&path)
            .map_err(|e| e.to_string())?;
        let provenance = Provenance {
            provider: "kenney".into(),
            external_id: c.id.clone(),
            title: c.name.clone(),
            creator: "Kenney".into(),
            license: "CC0 1.0".into(),
            license_url: "https://creativecommons.org/publicdomain/zero/1.0/".into(),
            source_url: "https://kenney.nl/assets/interface-sounds".into(),
            attribution: "Kenney — Interface Sounds, CC0 1.0".into(),
        };
        result.push(AudioItem {
            id: c.id,
            name: c.name,
            path: path_string(&path)?,
            duration: c.duration,
            group: c.group,
            provenance,
        });
    }
    Ok(result)
}
#[tauri::command]
pub async fn download_audio(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AudioLibraryState>,
    tools: State<'_, ToolState>,
    access: State<'_, Access>,
) -> Result<AudioItem, String> {
    let item = state
        .entries
        .lock()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or("Wyszukaj utwór ponownie przed pobraniem")?;
    let ffmpeg = {
        let t = tools.0.lock().unwrap();
        validate_tool("ffmpeg", t.ffmpeg.as_deref().ok_or("Wskaż FFmpeg")?)?
    };
    let job = state.job()?;
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("audio-library");
    let out = tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
            let target = root.join(format!("{}.{}", item.id, item.extension));
            if !target.is_file() {
                let mut url =
                    reqwest::Url::parse(&item.url).map_err(|_| "Nieprawidłowy adres utworu")?;
                if url.scheme() == "http" {
                    url.set_scheme("https")
                        .map_err(|_| "Nieprawidłowy protokół")?;
                }
                public_url(&url)?;
                let mut response = client()?
                    .get(url)
                    .send()
                    .map_err(|e| format!("Pobieranie audio: {e}"))?;
                if !response.status().is_success() {
                    return Err(format!(
                        "Dostawca nagrania zwrócił błąd {}",
                        response.status()
                    ));
                }
                if response
                    .content_length()
                    .is_some_and(|n| n > 100 * 1024 * 1024)
                {
                    return Err("Nagranie przekracza limit 100 MB".into());
                }
                let mut temp = tempfile::NamedTempFile::new_in(&root).map_err(|e| e.to_string())?;
                let mut bytes = 0usize;
                let mut buf = [0u8; 65536];
                loop {
                    job.check()?;
                    let n = response.read(&mut buf).map_err(|e| e.to_string())?;
                    if n == 0 {
                        break;
                    }
                    bytes += n;
                    if bytes > 100 * 1024 * 1024 {
                        return Err("Nagranie przekracza limit 100 MB".into());
                    }
                    temp.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                }
                temp.as_file().sync_all().map_err(|e| e.to_string())?;
                let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
                audio_library::probe(&job, &ffmpeg, temp.path(), dir.path())?;
                temp.persist(&target).map_err(|e| e.to_string())?;
            }
            let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
            let duration = audio_library::probe(&job, &ffmpeg, &target, dir.path())?;
            let provenance = Provenance {
                provider: "openverse".into(),
                external_id: item.id.clone(),
                title: item.title.clone(),
                creator: item.creator,
                license: item.license,
                license_url: item.license_url,
                source_url: item.source_url,
                attribution: item.attribution,
            };
            let audio = AudioItem {
                id: item.id,
                name: item.title,
                path: path_string(&std::fs::canonicalize(target).map_err(|e| e.to_string())?)?,
                duration,
                group: "Muzyka".into(),
                provenance,
            };
            // Keep attribution next to the downloaded file as well as in the project.
            let mut meta = tempfile::NamedTempFile::new_in(&root).map_err(|e| e.to_string())?;
            meta.write_all(
                serde_json::to_string_pretty(&audio)
                    .map_err(|e| e.to_string())?
                    .as_bytes(),
            )
            .map_err(|e| e.to_string())?;
            meta.persist(root.join(format!("{}.json", audio.id)))
                .map_err(|e| e.to_string())?;
            Ok(audio)
        })();
        job.status.lock().unwrap().state = if result.is_ok() {
            "completed"
        } else {
            "failed"
        }
        .into();
        result
    })
    .await
    .map_err(|e| e.to_string())??;
    let path = media_path(Path::new(&out.path))?;
    access.0.lock().unwrap().insert(path.clone());
    app.asset_protocol_scope()
        .allow_file(path)
        .map_err(|e| e.to_string())?;
    Ok(out)
}
#[tauri::command]
pub async fn audition_audio(
    path: String,
    app: tauri::AppHandle,
    access: State<'_, Access>,
    tools: State<'_, ToolState>,
    state: State<'_, AudioLibraryState>,
) -> Result<String, String> {
    use std::hash::{Hash, Hasher};
    let path = media_path(Path::new(&path))?;
    if !access.0.lock().unwrap().contains(&path) {
        return Err("Najpierw dodaj audio do biblioteki".into());
    }
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hash);
    meta.len().hash(&mut hash);
    meta.modified().ok().hash(&mut hash);
    let root = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("audio-audition");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let target = root.join(format!("{:016x}.wav", hash.finish()));
    let ffmpeg = {
        let t = tools.0.lock().unwrap();
        validate_tool("ffmpeg", t.ffmpeg.as_deref().ok_or("Wskaż FFmpeg")?)?
    };
    let job = state.job()?;
    let gate = state.gate.clone();
    let file = tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let _guard = gate.lock().map_err(|_| "Błąd kolejki odsłuchu")?;
            job.check()?;
            if !target.is_file() {
                let dir = tempfile::tempdir_in(&root).map_err(|e| e.to_string())?;
                let wav = dir.path().join("audition.wav");
                let mut args: Vec<std::ffi::OsString> = [
                    "-v",
                    "error",
                    "-nostdin",
                    "-y",
                    "-protocol_whitelist",
                    "file,pipe",
                    "-i",
                ]
                .iter()
                .map(Into::into)
                .collect();
                args.push(path.into_os_string());
                args.extend(
                    [
                        "-t",
                        "30",
                        "-vn",
                        "-ar",
                        "48000",
                        "-ac",
                        "2",
                        "-c:a",
                        "pcm_s16le",
                    ]
                    .iter()
                    .map(std::ffi::OsString::from),
                );
                args.push(wav.clone().into_os_string());
                crate::transcription::run_process(&job, &ffmpeg, &args, false, dir.path())?;
                std::fs::rename(wav, &target).map_err(|e| e.to_string())?;
            }
            Ok(target)
        })();
        job.status.lock().unwrap().state = if result.is_ok() {
            "completed"
        } else {
            "failed"
        }
        .into();
        result
    })
    .await
    .map_err(|e| e.to_string())??;
    app.asset_protocol_scope()
        .allow_file(&file)
        .map_err(|e| e.to_string())?;
    path_string(&file)
}
