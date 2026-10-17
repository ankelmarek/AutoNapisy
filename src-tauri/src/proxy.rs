//! Controlled, persistent video proxies. Project paths and originals are never modified.
use crate::{
    rendering,
    transcription::{self, Job},
};
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsString,
    fs,
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
    sync::Arc,
    time::UNIX_EPOCH,
};
pub const CACHE_LIMIT: u64 = 8 * 1024 * 1024 * 1024;
pub const PROFILE_VERSION: u32 = 1;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Stamp {
    pub path: String,
    pub bytes: u64,
    pub modified: String,
    pub sample: String,
}
fn hash(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |h, b| {
        (h ^ u64::from(*b)).wrapping_mul(0x100000001b3)
    })
}
pub fn stamp(path: &Path) -> Result<Stamp, String> {
    let path = fs::canonicalize(path).map_err(|e| format!("Brak źródła: {e}"))?;
    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Źródło nie jest plikiem".into());
    }
    let mut bytes = vec![0; 65536.min(meta.len() as usize)];
    file.read_exact(&mut bytes).map_err(|e| e.to_string())?;
    if meta.len() > 65536 {
        file.seek(SeekFrom::End(-65536))
            .map_err(|e| e.to_string())?;
        let mut end = vec![0; 65536];
        file.read_exact(&mut end).map_err(|e| e.to_string())?;
        bytes.extend(end);
    }
    Ok(Stamp {
        path: path.to_str().ok_or("Ścieżka nie jest Unicode")?.into(),
        bytes: meta.len(),
        modified: meta
            .modified()
            .map_err(|e| e.to_string())?
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
            .to_string(),
        sample: format!("{:016x}", hash(&bytes)),
    })
}
pub fn unchanged(stamp: &Stamp) -> bool {
    fs::metadata(&stamp.path).is_ok_and(|m| {
        m.len() == stamp.bytes
            && m.modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .is_some_and(|t| t.as_nanos().to_string() == stamp.modified)
    })
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub codec: String,
    pub profile: String,
    pub container: String,
    pub width: u32,
    pub height: u32,
    pub duration: f64,
    pub fps: Option<f64>,
    pub nominal_fps: Option<f64>,
    pub possible_vfr: bool,
    pub rotation: f64,
    pub hdr: bool,
    pub audio_streams: usize,
    pub color_primaries: String,
    pub color_transfer: String,
    pub color_space: String,
}
fn rate(v: &serde_json::Value) -> Option<f64> {
    let s = v.as_str()?;
    let n = if let Some((a, b)) = s.split_once('/') {
        a.parse::<f64>().ok()? / b.parse::<f64>().ok()?
    } else {
        s.parse().ok()?
    };
    (n.is_finite() && n > 0. && n <= 1000.).then_some(n)
}
pub fn parse_info(raw: &str) -> Result<Info, String> {
    let meta = rendering::parse_probe(raw)?;
    let v: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let streams = v["streams"].as_array().ok_or("Brak strumieni filmu")?;
    let s = streams
        .iter()
        .find(|s| s["codec_type"] == "video" && s["width"].as_u64().unwrap_or(0) > 0)
        .ok_or("Brak obrazu")?;
    let text = |key: &str| s[key].as_str().unwrap_or("").to_owned();
    let fps = rate(&s["avg_frame_rate"]);
    let nominal = rate(&s["r_frame_rate"]);
    let rotation = s["side_data_list"]
        .as_array()
        .and_then(|a| a.iter().find_map(|s| s["rotation"].as_f64()))
        .or_else(|| s["tags"]["rotate"].as_str().and_then(|s| s.parse().ok()))
        .unwrap_or(0.);
    Ok(Info {
        codec: text("codec_name"),
        profile: text("profile"),
        container: v["format"]["format_name"].as_str().unwrap_or("").into(),
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
        fps,
        nominal_fps: nominal,
        possible_vfr: fps.zip(nominal).is_some_and(|(a, b)| (a - b).abs() > 0.1),
        rotation,
        hdr: matches!(
            text("color_transfer").as_str(),
            "smpte2084" | "arib-std-b67"
        ),
        audio_streams: streams
            .iter()
            .filter(|s| s["codec_type"] == "audio")
            .count(),
        color_primaries: text("color_primaries"),
        color_transfer: text("color_transfer"),
        color_space: text("color_space"),
    })
}
impl Info {
    pub fn recommended(&self) -> bool {
        !self.hdr
            && (self.codec != "h264"
                || self.width.max(self.height) > 1920
                || self.fps.unwrap_or(0.) > 40.
                || self.possible_vfr)
    }
}
pub fn inspect(job: &Arc<Job>, ffmpeg: &Path, path: &Path, dir: &Path) -> Result<Info, String> {
    let capture = dir.join("proxy-probe.json");
    let mut args: Vec<OsString> = [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
    ]
    .iter()
    .map(Into::into)
    .collect();
    args.push(path.into());
    transcription::run_process_capture(
        job,
        &rendering::ffprobe_path(ffmpeg)?,
        &args,
        false,
        dir,
        Some(&capture),
    )?;
    let mut raw = String::new();
    fs::File::open(capture)
        .map_err(|e| e.to_string())?
        .take(512 * 1024 + 1)
        .read_to_string(&mut raw)
        .map_err(|e| e.to_string())?;
    if raw.len() > 512 * 1024 {
        return Err("Zbyt obszerny opis filmu".into());
    }
    parse_info(&raw)
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub version: u32,
    pub profile: u32,
    pub source: Stamp,
    pub info: Info,
    pub output: Stamp,
}
pub fn key(source: &Stamp, profile: u32) -> String {
    format!(
        "{:016x}-{profile}-v{PROFILE_VERSION}",
        hash(&serde_json::to_vec(source).unwrap_or_default())
    )
}
pub fn cached(root: &Path, source: &Stamp, profile: u32) -> Option<Manifest> {
    let dir = root.join(key(source, profile));
    let raw = fs::read(dir.join("manifest.json")).ok()?;
    if raw.len() > 65536 {
        return None;
    }
    let m: Manifest = serde_json::from_slice(&raw).ok()?;
    let output = dir.join("video.mp4");
    if m.version != PROFILE_VERSION
        || m.profile != profile
        || &m.source != source
        || !unchanged(&m.source)
        || fs::canonicalize(&output).ok()?.to_str()? != m.output.path
        || stamp(&output).ok()? != m.output
    {
        return None;
    }
    Some(m)
}
pub fn cache_bytes(root: &Path) -> u64 {
    fs::read_dir(root)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|e| e.path().is_dir())
        .flat_map(|e| fs::read_dir(e.path()).ok().into_iter().flatten())
        .filter_map(Result::ok)
        .filter_map(|e| e.metadata().ok())
        .filter(|m| m.is_file())
        .map(|m| m.len())
        .sum()
}
pub fn dimensions(info: &Info, profile: u32) -> Result<(u32, u32), String> {
    if ![540, 720].contains(&profile) {
        return Err("Nieznany profil proxy".into());
    }
    let scale = (profile as f64 / info.width.max(info.height) as f64).min(1.);
    let width = (((info.width as f64 * scale / 2.).round() as u32) * 2).max(2);
    let height = (((info.height as f64 * scale / 2.).round() as u32) * 2).max(2);
    Ok((width, height))
}
pub fn generate(
    job: &Arc<Job>,
    ffmpeg: &Path,
    root: &Path,
    source: &Stamp,
    info: &Info,
    profile: u32,
    max_bytes: u64,
) -> Result<Manifest, String> {
    job.check()?;
    let (width, height) = dimensions(info, profile)?;
    if info.hdr {
        return Err("Ten profil proxy obsługuje SDR. Materiał HDR pozostaje na oryginale.".into());
    }
    if max_bytes < 1024 * 1024 {
        return Err(
            "Brak miejsca w limicie cache proxy (8 GiB). Wyczyść cache w ustawieniach.".into(),
        );
    }
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let temp = tempfile::Builder::new()
        .prefix("building-")
        .tempdir_in(root)
        .map_err(|e| e.to_string())?;
    let output = temp.path().join("video.mp4");
    *job.progress_duration.lock().unwrap() = Some(info.duration);
    {
        let mut s = job.status.lock().unwrap();
        s.state = "rendering".into();
        s.message = "Przygotowywanie proxy…".into();
        s.progress = Some(0);
    }
    let filter = format!("scale={width}:{height},setsar=1,fps=30");
    let mut args: Vec<OsString> = [
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-progress",
        "pipe:2",
        "-threads",
        "2",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
    ]
    .iter()
    .map(Into::into)
    .collect();
    args.push(source.path.clone().into());
    args.extend(
        [
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            &filter,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "22",
            "-maxrate",
            "4M",
            "-bufsize",
            "8M",
            "-g",
            "15",
            "-keyint_min",
            "15",
            "-sc_threshold",
            "0",
            "-pix_fmt",
            "yuv420p",
            "-threads",
            "2",
            "-c:a",
            "aac",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-b:a",
            "128k",
            "-map_metadata",
            "-1",
            "-metadata:s:v:0",
            "rotate=0",
            "-movflags",
            "+faststart",
        ]
        .iter()
        .map(OsString::from),
    );
    args.push(output.clone().into());
    transcription::run_process_bounded(job, ffmpeg, &args, temp.path(), &output, max_bytes)?;
    job.check()?;
    let result = rendering::inspect(job, ffmpeg, &output, temp.path())?;
    if (result.duration - info.duration).abs() > 0.15
        || result.width != width
        || result.height != height
        || result.has_audio != (info.audio_streams > 0)
    {
        return Err("Proxy nie zachowuje czasu, wymiarów lub dźwięku źródła".into());
    }
    if stamp(Path::new(&source.path))? != *source {
        return Err("Źródło zmieniło się podczas tworzenia proxy. Ponów przygotowanie.".into());
    }
    let dir = root.join(key(source, profile));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join("video.mp4");
    if let Ok(raw)=fs::read(dir.join("manifest.json")){
        if let Ok(previous)=serde_json::from_slice::<Manifest>(&raw){
            if previous.source!=*source{return Err("Kolizja identyfikatora cache. Wyczyść cache proxy i ponów.".into());}
        }
    }
    // An existing valid result is immutable: an active preview may still be reading it.
    if let Some(m) = cached(root, source, profile) {
        return Ok(m);
    }
    if target.exists() {
        fs::remove_file(&target)
            .map_err(|e| format!("Proxy jest używane; zatrzymaj podgląd: {e}"))?;
    }
    fs::rename(&output, &target).map_err(|e| e.to_string())?;
    let manifest = Manifest {
        version: PROFILE_VERSION,
        profile,
        source: source.clone(),
        info: info.clone(),
        output: stamp(&target)?,
    };
    let mut json = tempfile::NamedTempFile::new_in(&dir).map_err(|e| e.to_string())?;
    json.write_all(&serde_json::to_vec(&manifest).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    json.as_file().sync_all().map_err(|e| e.to_string())?;
    json.persist(dir.join("manifest.json"))
        .map_err(|e| e.to_string())?;
    Ok(manifest)
}
pub fn substitute(
    p: &crate::project::Project,
    paths: &std::collections::HashMap<String, String>,
) -> crate::project::Project {
    let mut result = p.clone();
    if let Some(m) = &mut result.media {
        if let Some(path) = paths.get(&m.path) {
            m.path = path.clone();
        }
    }
    for a in &mut result.assets {
        if a.kind == "video" {
            if let Some(path) = paths.get(&a.path) {
                a.path = path.clone();
            }
        }
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn diagnostic_preserves_rotation_and_exposes_vfr_hdr() {
        let raw = r#"{"streams":[{"codec_type":"video","codec_name":"hevc","width":3840,"height":2160,"avg_frame_rate":"30000/1001","r_frame_rate":"60/1","color_transfer":"smpte2084","side_data_list":[{"rotation":90}]},{"codec_type":"audio"}],"format":{"duration":"4","format_name":"mov,mp4"}}"#;
        let info = parse_info(raw).unwrap();
        assert_eq!((info.width, info.height), (2160, 3840));
        assert!(info.possible_vfr && info.hdr);
        assert_eq!(info.audio_streams, 1);
        assert_eq!(dimensions(&info, 540).unwrap(), (304, 540));
        assert!(!info.recommended());
    }
    #[test]
    fn modified_source_and_profile_invalidate_identity() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Łódź film.mp4");
        fs::write(&path, b"first").unwrap();
        let a = stamp(&path).unwrap();
        fs::write(&path, b"second version").unwrap();
        let b = stamp(&path).unwrap();
        assert_ne!(key(&a, 540), key(&b, 540));
        assert_ne!(key(&a, 540), key(&a, 720));
        assert!(!unchanged(&a));
    }
}
