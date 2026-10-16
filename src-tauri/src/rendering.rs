//! Bitmap subtitle compositor: fixed FFmpeg commands, atomic destination replacement.
use crate::{
    project::Project,
    transcription::{run_process, run_process_capture, Job},
};
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsString,
    fs,
    io::{Cursor, Read},
    path::{Path, PathBuf},
    sync::{atomic::Ordering, Arc},
    time::SystemTime,
};
pub const MAX_FRAMES: usize = 3000;
pub const MAX_PNG_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_TOTAL_BYTES: usize = 512 * 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    pub width: u32,
    pub height: u32,
    pub duration: f64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Fingerprint {
    len: u64,
    modified: Option<SystemTime>,
}
pub fn fingerprint(path: &Path) -> Result<Option<Fingerprint>, String> {
    match fs::metadata(path) {
        Ok(m) => {
            if !m.is_file() {
                return Err("Cel eksportu nie jest plikiem".into());
            }
            Ok(Some(Fingerprint {
                len: m.len(),
                modified: m.modified().ok(),
            }))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
pub fn validate_destination(source: &Path, target: &Path) -> Result<(), String> {
    if target
        .extension()
        .and_then(|s| s.to_str())
        .map_or(true, |s| !s.eq_ignore_ascii_case("mp4"))
    {
        return Err("Wybierz plik z rozszerzeniem .mp4".into());
    }
    if fs::canonicalize(target).ok().as_deref() == Some(source) {
        return Err("Wybierz inną nazwę niż oryginalny film".into());
    }
    Ok(())
}
pub fn ffprobe_path(ffmpeg: &Path) -> Result<PathBuf, String> {
    let name = if cfg!(windows) {
        "ffprobe.exe"
    } else {
        "ffprobe"
    };
    let probe = ffmpeg.parent().ok_or("Błąd ścieżki FFmpeg")?.join(name);
    if !probe.is_file() {
        return Err(
            "Brak ffprobe obok FFmpeg. Rozpakuj pełną paczkę FFmpeg wraz z folderem bin.".into(),
        );
    }
    fs::canonicalize(probe).map_err(|e| e.to_string())
}
#[derive(Deserialize)]
struct Probe {
    streams: Vec<Stream>,
    format: Format,
}
#[derive(Deserialize)]
struct Format {
    duration: Option<String>,
}
#[derive(Deserialize)]
struct Stream {
    width: u32,
    height: u32,
    sample_aspect_ratio: Option<String>,
    #[serde(default)]
    tags: std::collections::HashMap<String, String>,
    #[serde(default)]
    side_data_list: Vec<SideData>,
}
#[derive(Deserialize)]
struct SideData {
    rotation: Option<f64>,
}
pub fn parse_probe(json: &str) -> Result<Metadata, String> {
    let p: Probe = serde_json::from_str(json)
        .map_err(|e| format!("Nie można odczytać informacji o filmie: {e}"))?;
    let stream = p.streams.first().ok_or("Film nie ma ścieżki wideo")?;
    let duration = p
        .format
        .duration
        .and_then(|v| v.parse::<f64>().ok())
        .filter(|v| v.is_finite() && *v > 0.0 && *v <= 86400.0)
        .ok_or("Nie można ustalić długości filmu (limit 24 godzin)")?;
    let sar = stream
        .sample_aspect_ratio
        .as_deref()
        .and_then(|v| v.split_once(':'))
        .and_then(|(a, b)| Some(a.parse::<f64>().ok()? / b.parse::<f64>().ok()?))
        .filter(|v| v.is_finite() && *v > 0.0 && *v <= 10.0)
        .unwrap_or(1.0);
    let mut width = stream.width as f64 * sar;
    let mut height = stream.height as f64;
    let rotation = stream
        .side_data_list
        .iter()
        .find_map(|s| s.rotation)
        .or_else(|| stream.tags.get("rotate").and_then(|v| v.parse().ok()))
        .unwrap_or(0.0);
    if !rotation.is_finite() || (rotation / 90.0 - (rotation / 90.0).round()).abs() > 0.001 {
        return Err("Nieobsługiwany kąt obrotu filmu".into());
    }
    if (rotation.round() as i64).rem_euclid(180) != 0 {
        std::mem::swap(&mut width, &mut height);
    }
    let width = (width / 2.0).ceil() as u32 * 2;
    let height = (height / 2.0).ceil() as u32 * 2;
    if width < 2
        || height < 2
        || width > 8192
        || height > 8192
        || u64::from(width) * u64::from(height) > 16_777_216
    {
        return Err("Eksport obsługuje obraz do 16 megapikseli i 8192 px na krawędź".into());
    }
    Ok(Metadata {
        width,
        height,
        duration,
    })
}
pub fn inspect(
    job: &Arc<Job>,
    ffmpeg: &Path,
    media: &Path,
    dir: &Path,
) -> Result<Metadata, String> {
    let probe = ffprobe_path(ffmpeg)?;
    let capture = dir.join("probe.json");
    let mut args:Vec<OsString>=["-v","error","-protocol_whitelist","file,pipe","-select_streams","v:0","-show_entries","stream=width,height,sample_aspect_ratio:stream_tags=rotate:stream_side_data=rotation:format=duration","-of","json"].iter().map(Into::into).collect();
    args.push(media.as_os_str().to_owned());
    run_process_capture(job, &probe, &args, false, dir, Some(&capture))?;
    let mut data = String::new();
    fs::File::open(capture)
        .map_err(|e| e.to_string())?
        .take(65537)
        .read_to_string(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() > 65536 {
        return Err("Zbyt obszerny wynik FFprobe".into());
    }
    parse_probe(&data)
}
pub fn frame_name(index: usize) -> String {
    format!("caption-{index:06}.png")
}
pub fn validate_frame(bytes: &[u8], meta: &Metadata) -> Result<(), String> {
    if bytes.len() > MAX_PNG_BYTES {
        return Err("Pojedyncza plansza przekracza 8 MB".into());
    }
    let decoder = png::Decoder::new(Cursor::new(bytes));
    let mut reader = decoder
        .read_info()
        .map_err(|e| format!("Niepoprawny PNG: {e}"))?;
    let info = reader.info();
    if info.width != meta.width
        || info.height != meta.height
        || info.color_type != png::ColorType::Rgba
        || info.bit_depth != png::BitDepth::Eight
    {
        return Err("Niezgodny rozmiar lub format planszy PNG".into());
    }
    let expected = meta.width as usize * meta.height as usize * 4;
    if reader.output_buffer_size() != expected {
        return Err("Niepoprawny rozmiar bufora PNG".into());
    }
    let mut buffer = vec![0; expected];
    reader
        .next_frame(&mut buffer)
        .map_err(|e| format!("Uszkodzona plansza: {e}"))?;
    Ok(())
}
fn empty_png(dir: &Path, meta: &Metadata) -> Result<(), String> {
    let file = fs::File::create(dir.join("empty.png")).map_err(|e| e.to_string())?;
    let mut encoder = png::Encoder::new(file, meta.width, meta.height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer
        .write_image_data(&vec![0; meta.width as usize * meta.height as usize * 4])
        .map_err(|e| e.to_string())
}
#[derive(Debug, PartialEq)]
pub struct Interval {
    pub index: Option<usize>,
    pub start: f64,
    pub end: f64,
}
pub fn timeline(project: &Project, duration: f64) -> Vec<Interval> {
    let mut points = vec![0.0, duration];
    for s in &project.segments {
        points.push(s.start.min(duration));
        points.push(s.end.min(duration));
    }
    points.sort_by(f64::total_cmp);
    points.dedup();
    let mut result: Vec<Interval> = Vec::new();
    for range in points.windows(2) {
        let (start, end) = (range[0], range[1]);
        if end <= start {
            continue;
        }
        let mut active = None;
        for (i, s) in project.segments.iter().enumerate() {
            if !s.text.trim().is_empty()
                && s.start <= start
                && start < s.end
                && active.map_or(true, |last: usize| s.start >= project.segments[last].start)
            {
                active = Some(i);
            }
        }
        if let Some(last) = result.last_mut() {
            if last.index == active {
                last.end = end;
                continue;
            }
        }
        result.push(Interval {
            index: active,
            start,
            end,
        });
    }
    result
}
fn concat_text(intervals: &[Interval]) -> String {
    let mut text = String::from("ffconcat version 1.0\n");
    let name = |index: Option<usize>| index.map(frame_name).unwrap_or_else(|| "empty.png".into());
    for entry in intervals {
        text.push_str(&format!(
            "file '{}'\noption framerate 1000\nduration {:.6}\n",
            name(entry.index),
            entry.end - entry.start
        ));
    }
    if let Some(last) = intervals.last() {
        text.push_str(&format!(
            "file '{}'\noption framerate 1000\n",
            name(last.index)
        ));
    }
    text
}
pub fn render(
    job: &Arc<Job>,
    ffmpeg: &Path,
    media: &Path,
    target: &Path,
    original: &Option<Fingerprint>,
    dir: &Path,
    project: &Project,
    meta: &Metadata,
) -> Result<(), String> {
    let target_text = target
        .to_str()
        .ok_or("Ścieżka nie jest Unicode")?
        .to_owned();
    job.check()?;
    let intervals = timeline(project, meta.duration);
    if !intervals.iter().any(|i| i.index.is_some()) {
        return Err("Żaden napis nie mieści się w czasie filmu".into());
    }
    empty_png(dir, meta)?;
    fs::write(dir.join("timeline.ffconcat"), concat_text(&intervals)).map_err(|e| e.to_string())?;
    let filter=format!("[0:v:0]scale={}:{},setsar=1[base];[1:v:0]format=rgba[subs];[base][subs]overlay=0:0:eof_action=repeat:repeatlast=1:format=auto,format=yuv420p[v]",meta.width,meta.height);
    let mut args: Vec<OsString> = [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
    ]
    .iter()
    .map(Into::into)
    .collect();
    args.push(media.as_os_str().to_owned());
    args.extend(
        [
            "-protocol_whitelist",
            "file,pipe",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            "timeline.ffconcat",
            "-filter_complex",
        ]
        .iter()
        .map(Into::into),
    );
    args.push(filter.into());
    args.extend(
        [
            "-map",
            "[v]",
            "-map",
            "0:a:0?",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-fps_mode",
            "vfr",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-map_metadata",
            "-1",
            "-metadata:s:v:0",
            "rotate=0",
            "-movflags",
            "+faststart",
            "-progress",
            "pipe:2",
            "-nostats",
            "-t",
        ]
        .iter()
        .map(Into::into),
    );
    args.push(meta.duration.to_string().into());
    args.push("render.mp4".into());
    run_process(job, ffmpeg, &args, false, dir)?;
    job.check()?;
    let output = dir.join("render.mp4");
    if fs::metadata(&output).map_err(|e| e.to_string())?.len() == 0 {
        return Err("FFmpeg utworzył pusty plik".into());
    }
    fs::OpenOptions::new()
        .write(true)
        .open(&output)
        .and_then(|f| f.sync_all())
        .map_err(|e| e.to_string())?;
    // Serialize cancellation with the final commit. No destination writes before this point.
    let mut status = job.status.lock().unwrap();
    if job.cancel.load(Ordering::SeqCst) {
        return Err("Anulowano eksport".into());
    }
    if fingerprint(target)? != *original {
        return Err(
            "Plik docelowy zmienił się podczas eksportu. Wybierz inną nazwę i spróbuj ponownie."
                .into(),
        );
    }
    fs::rename(&output, target).map_err(|e| format!("Nie można zapisać MP4: {e}"))?;
    status.state = "completed".into();
    status.progress = Some(100);
    status.message = "Eksport MP4 zakończony".into();
    status.output_path = Some(target_text);
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn project() -> Project {
        crate::project::parse(r##"{"schemaVersion":2,"name":"x","media":null,"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#111111","position":"bottom"}},"createdAt":"2026-10-16T00:00:00Z","updatedAt":"2026-10-16T00:00:00Z"}"##).unwrap()
    }
    #[test]
    fn metadata_accounts_for_rotation_and_sar() {
        let m=parse_probe(r#"{"streams":[{"width":1920,"height":1080,"sample_aspect_ratio":"1:1","side_data_list":[{"rotation":-90}]}],"format":{"duration":"2.5"}}"#).unwrap();
        assert_eq!((m.width, m.height), (1080, 1920));
        assert_eq!(m.duration, 2.5);
        assert!(parse_probe(r#"{"streams":[],"format":{}}"#).is_err());
    }
    #[test]
    fn timeline_has_gaps_and_one_winner() {
        let mut p = project();
        p.segments = vec![
            crate::project::Segment {
                id: "a".into(),
                text: "a".into(),
                start: 1.0,
                end: 3.0,
                words: vec![],
                style_id: "default".into(),
            },
            crate::project::Segment {
                id: "b".into(),
                text: "b".into(),
                start: 2.0,
                end: 2.5,
                words: vec![],
                style_id: "default".into(),
            },
        ];
        assert_eq!(
            timeline(&p, 4.0),
            vec![
                Interval {
                    index: None,
                    start: 0.0,
                    end: 1.0
                },
                Interval {
                    index: Some(0),
                    start: 1.0,
                    end: 2.0
                },
                Interval {
                    index: Some(1),
                    start: 2.0,
                    end: 2.5
                },
                Interval {
                    index: Some(0),
                    start: 2.5,
                    end: 3.0
                },
                Interval {
                    index: None,
                    start: 3.0,
                    end: 4.0
                }
            ]
        );
    }
    #[test]
    fn source_cannot_be_destination() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("źródło.mp4");
        fs::write(&source, b"video").unwrap();
        assert!(validate_destination(&fs::canonicalize(&source).unwrap(), &source).is_err());
    }
    #[test]
    fn detects_destination_change() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.mp4");
        let original = fingerprint(&p).unwrap();
        fs::write(&p, b"changed").unwrap();
        assert_ne!(fingerprint(&p).unwrap(), original);
    }
    #[test]
    fn refuses_wrong_png_dimensions() {
        let dir = tempfile::tempdir().unwrap();
        let meta = Metadata {
            width: 2,
            height: 2,
            duration: 1.0,
        };
        empty_png(dir.path(), &meta).unwrap();
        let bytes = fs::read(dir.path().join("empty.png")).unwrap();
        assert!(validate_frame(&bytes, &meta).is_ok());
        assert!(validate_frame(&bytes, &Metadata { width: 4, ..meta }).is_err());
    }
}
