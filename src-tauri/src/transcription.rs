//! Local-only whisper.cpp/FFmpeg adapter. No shell, network, or frontend-supplied arguments.
use crate::project::{Segment, Word};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Tools {
    pub ffmpeg: Option<PathBuf>,
    pub whisper: Option<PathBuf>,
    pub model: Option<PathBuf>,
}

pub fn validate_tool(kind: &str, path: &Path) -> Result<PathBuf, String> {
    let path = fs::canonicalize(path).map_err(|e| format!("Nie można otworzyć komponentu: {e}"))?;
    if !path.is_file() {
        return Err("Komponent musi być plikiem".into());
    }
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    match kind {
        "ffmpeg" if name == "ffmpeg.exe" || name == "ffmpeg" => {}
        "whisper" if name == "whisper-cli.exe" || name == "whisper-cli" => {}
        "model" => {
            if !name.ends_with(".bin") || name.contains(".en.") {
                return Err("Wybierz wielojęzyczny model ggml-*.bin, bez .en".into());
            }
            let mut magic = [0; 4];
            fs::File::open(&path)
                .and_then(|mut f| f.read_exact(&mut magic))
                .map_err(|e| format!("Nie można odczytać modelu: {e}"))?;
            if magic != [0x6c, 0x6d, 0x67, 0x67] {
                return Err("To nie jest model GGML whisper.cpp".into());
            }
        }
        _ => return Err("Wybierz ffmpeg.exe, whisper-cli.exe lub model GGML".into()),
    }
    Ok(path)
}
impl Tools {
    pub fn validated(&self) -> Result<Self, String> {
        Ok(Self {
            ffmpeg: Some(validate_tool(
                "ffmpeg",
                self.ffmpeg
                    .as_deref()
                    .ok_or("Wskaż FFmpeg w ustawieniach")?,
            )?),
            whisper: Some(validate_tool(
                "whisper",
                self.whisper
                    .as_deref()
                    .ok_or("Wskaż whisper-cli w ustawieniach")?,
            )?),
            model: Some(validate_tool(
                "model",
                self.model
                    .as_deref()
                    .ok_or("Wskaż wielojęzyczny model Whisper w ustawieniach")?,
            )?),
        })
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportInfo {
    pub width: u32,
    pub height: u32,
    pub duration: f64,
    pub frames: usize,
    pub received: usize,
    pub output_path: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub id: u64,
    pub state: String,
    pub message: String,
    /// Real percentage reported by whisper, not an estimate for the whole job.
    pub progress: Option<u8>,
    pub segments: Option<Vec<Segment>>,
    pub audio_duration: Option<f64>,
    pub export_info: Option<ExportInfo>,
    pub output_path: Option<String>,
}
pub struct Job {
    pub cancel: AtomicBool,
    pub status: Mutex<Status>,
    pub progress_duration: Mutex<Option<f64>>,
    child: Mutex<Option<Child>>,
}
impl Job {
    pub fn new(id: u64) -> Self {
        Self {
            cancel: AtomicBool::new(false),
            progress_duration: Mutex::new(None),
            child: Mutex::new(None),
            status: Mutex::new(Status {
                id,
                state: "preparing".into(),
                message: "Przygotowywanie dźwięku…".into(),
                progress: None,
                segments: None,
                audio_duration: None,
                export_info: None,
                output_path: None,
            }),
        }
    }
    pub fn active(&self) -> bool {
        let s = self.status.lock().unwrap();
        matches!(
            s.state.as_str(),
            "preparing" | "transcribing" | "awaiting_frames" | "rendering" | "cancelling"
        )
    }
    pub fn cancel(&self) {
        // Share the status lock with completion so cancellation cannot turn a completed job into a running one.
        let mut status = self.status.lock().unwrap();
        if !matches!(
            status.state.as_str(),
            "preparing" | "transcribing" | "awaiting_frames" | "rendering" | "cancelling"
        ) {
            return;
        }
        self.cancel.store(true, Ordering::SeqCst);
        status.state = "cancelling".into();
        status.message = "Anulowanie…".into();
        drop(status);
        if let Some(child) = self.child.lock().unwrap().as_mut() {
            let _ = child.kill();
        }
    }
    pub(crate) fn check(&self) -> Result<(), String> {
        if self.cancel.load(Ordering::SeqCst) {
            Err("Anulowano zadanie".into())
        } else {
            Ok(())
        }
    }
}
impl Drop for Job {
    fn drop(&mut self) {
        if let Ok(slot) = self.child.get_mut() {
            if let Some(mut child) = slot.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

pub fn progress_from_line(line: &str) -> Option<u8> {
    if !line.contains("progress =") {
        return None;
    }
    let tail = line.split("progress =").nth(1)?;
    let n = tail.split('%').next()?.trim().parse::<u8>().ok()?;
    (n <= 100).then_some(n)
}

pub(crate) fn run_process(
    job: &Arc<Job>,
    program: &Path,
    args: &[std::ffi::OsString],
    whisper: bool,
    cwd: &Path,
) -> Result<(), String> {
    run_process_capture(job, program, args, whisper, cwd, None)
}

pub(crate) fn run_process_capture(
    job: &Arc<Job>,
    program: &Path,
    args: &[std::ffi::OsString],
    whisper: bool,
    cwd: &Path,
    capture: Option<&Path>,
) -> Result<(), String> {
    run_process_inner(job, program, args, whisper, cwd, capture, None)
}
pub(crate) fn run_process_bounded(
    job: &Arc<Job>,
    program: &Path,
    args: &[std::ffi::OsString],
    cwd: &Path,
    output: &Path,
    max_bytes: u64,
) -> Result<(), String> {
    run_process_inner(
        job,
        program,
        args,
        false,
        cwd,
        None,
        Some((output, max_bytes)),
    )
}
fn run_process_inner(
    job: &Arc<Job>,
    program: &Path,
    args: &[std::ffi::OsString],
    whisper: bool,
    cwd: &Path,
    capture: Option<&Path>,
    limit: Option<(&Path, u64)>,
) -> Result<(), String> {
    job.check()?;
    let mut command = Command::new(program);
    crate::mlt::configure(&mut command, program);
    command
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    if let Some(path) = capture {
        command.stdout(fs::File::create(path).map_err(|e| e.to_string())?);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|e| {
        format!(
            "Nie można uruchomić {}: {e}. Sprawdź też biblioteki DLL obok programu.",
            program.display()
        )
    })?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Brak strumienia diagnostycznego")?;
    *job.child.lock().unwrap() = Some(child);
    let reporter = Arc::clone(job);
    let reader = thread::spawn(move || {
        // Bound individual lines as well as retained output, so a noisy child cannot exhaust memory.
        let mut stderr = BufReader::new(stderr);
        let mut tail = String::new();
        let mut part = Vec::new();
        loop {
            part.clear();
            match std::io::Read::by_ref(&mut stderr)
                .take(4096)
                .read_until(b'\n', &mut part)
            {
                Ok(0) | Err(_) => break,
                Ok(_) => {}
            }
            let line = String::from_utf8_lossy(&part);
            if whisper {
                if let Some(p) = progress_from_line(&line) {
                    let mut s = reporter.status.lock().unwrap();
                    if s.state == "transcribing" {
                        s.progress = Some(s.progress.unwrap_or(0).max(p));
                    }
                }
            }
            if !whisper {
                if let Some(value) = line
                    .trim()
                    .strip_prefix("out_time_us=")
                    .and_then(|s| s.parse::<f64>().ok())
                {
                    let mut status = reporter.status.lock().unwrap();
                    if status.state == "rendering" {
                        let duration = status
                            .export_info
                            .as_ref()
                            .map(|info| info.duration)
                            .or(*reporter.progress_duration.lock().unwrap());
                        if let Some(duration) = duration {
                            let percent =
                                ((value / 1_000_000.0 / duration) * 100.0).clamp(0.0, 99.0) as u8;
                            status.progress = Some(status.progress.unwrap_or(0).max(percent));
                        }
                    }
                }
            }
            tail.push_str(&line);
            if tail.len() > 8192 {
                let mut cut = tail.len() - 8192;
                while !tail.is_char_boundary(cut) {
                    cut += 1;
                }
                tail.drain(..cut);
            }
        }
        tail
    });
    let bounded_preview = program
        .file_name()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s == "melt" || s == "melt.exe")
        && args.iter().any(|a| a == "avformat:preview.mp4");
    let result = loop {
        let mut slot = job.child.lock().unwrap();
        let child = slot.as_mut().ok_or("Proces nie istnieje")?;
        if limit.is_some_and(|(path, max)| fs::metadata(path).is_ok_and(|m| m.len() > max)) {
            let _ = child.kill();
            let _ = child.wait();
            slot.take();
            break Err("Przekroczono limit miejsca dla proxy. Zwolnij cache i ponów.".into());
        }
        if bounded_preview
            && fs::metadata(cwd.join("preview.mp4")).is_ok_and(|m| m.len() > 512 * 1024 * 1024)
        {
            let _ = child.kill();
            let _ = child.wait();
            slot.take();
            break Err(
                "Bufor podglądu przekroczył 512 MB. Przewiń film, aby rozpocząć nowy bufor.".into(),
            );
        }
        if job.cancel.load(Ordering::SeqCst) {
            let _ = child.kill();
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                slot.take();
                break Ok(status);
            }
            Ok(None) => {}
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                slot.take();
                break Err(e.to_string());
            }
        }
        drop(slot);
        thread::sleep(Duration::from_millis(100));
    };
    let diagnostic = reader
        .join()
        .unwrap_or_else(|_| "Nie można odczytać diagnostyki procesu".into());
    job.check()?;
    let status = result?;
    if !status.success() {
        return Err(format!(
            "{} zakończył się błędem ({status}). {diagnostic}",
            program.file_name().unwrap_or_default().to_string_lossy()
        ));
    }
    Ok(())
}

#[derive(Deserialize)]
struct WhisperOutput {
    transcription: Vec<WhisperSegment>,
    model: Option<ModelInfo>,
}
#[derive(Deserialize)]
struct ModelInfo {
    multilingual: bool,
}
#[derive(Deserialize)]
struct WhisperSegment {
    text: String,
    offsets: Offsets,
    #[serde(default)]
    tokens: Vec<Token>,
}
#[derive(Deserialize)]
struct Offsets {
    from: f64,
    to: f64,
}
#[derive(Deserialize)]
struct Token {
    text: String,
    offsets: Option<Offsets>,
    id: Option<i64>,
}
fn interval(offset: &Offsets) -> Result<(f64, f64), String> {
    let (start, end) = (offset.from / 1000.0, offset.to / 1000.0);
    if !start.is_finite() || !end.is_finite() || start < 0.0 || end < start {
        return Err("Whisper zwrócił niepoprawne czasy".into());
    }
    Ok((start, end))
}
fn words(tokens: &[Token], start: f64, end: f64, text: &str) -> Vec<Word> {
    let mut result: Vec<Word> = Vec::new();
    for token in tokens {
        if token.id.is_some_and(|id| id >= 50257)
            || (token.text.starts_with("[_") && token.text.ends_with("]"))
        {
            continue;
        }
        if token.text.trim().is_empty() {
            continue;
        }
        let Some(offset) = &token.offsets else {
            return Vec::new();
        };
        let Ok((from, to)) = interval(offset) else {
            return Vec::new();
        };
        if from < start || to > end || result.last().is_some_and(|w| from < w.start) {
            return Vec::new();
        }
        if token.text.starts_with(char::is_whitespace) || result.is_empty() {
            result.push(Word {
                text: token.text.trim().into(),
                start: from,
                end: to,
            });
        } else if let Some(last) = result.last_mut() {
            last.text.push_str(&token.text);
            last.end = last.end.max(to);
        }
    }
    // Never fabricate word boundaries when the token stream does not reconstruct the segment.
    if result
        .iter()
        .map(|w| w.text.as_str())
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        != text.split_whitespace().collect::<Vec<_>>()
    {
        return Vec::new();
    }
    result
}
pub fn parse_output(json: &str, duration: f64) -> Result<Vec<Segment>, String> {
    if !duration.is_finite() || duration <= 0.0 {
        return Err("Niepoprawna długość dźwięku".into());
    }
    let output: WhisperOutput = serde_json::from_str(json)
        .map_err(|e| format!("Niepoprawny wynik JSON whisper.cpp: {e}"))?;
    if output.model.is_some_and(|m| !m.multilingual) {
        return Err("Model obsługuje tylko angielski. Wybierz model wielojęzyczny.".into());
    }
    let mut result = Vec::new();
    let mut previous = 0.0;
    for (i, s) in output.transcription.into_iter().enumerate() {
        let (start, end) = interval(&s.offsets)?;
        if start < previous {
            return Err("Whisper zwrócił segmenty w niepoprawnej kolejności".into());
        }
        previous = start;
        if s.text.trim().is_empty() || start >= duration {
            continue;
        }
        let end = end.min(duration);
        if end <= start {
            continue;
        }
        result.push(Segment {
            id: format!("whisper-{i}"),
            text: s.text.trim().into(),
            start,
            end,
            words: words(&s.tokens, start, end, &s.text),
            style_id: "default".into(),
        });
    }
    Ok(result)
}

fn write_response(path: &Path, args: &[std::ffi::OsString]) -> Result<(), String> {
    let mut text = String::new();
    for arg in args {
        let value = arg
            .to_str()
            .ok_or("Ścieżka komponentu nie jest poprawnym Unicode")?;
        if value.contains(['\n', '\r']) {
            return Err("Ścieżka zawiera niedozwolony znak nowej linii".into());
        }
        text.push_str(value);
        text.push('\n');
    }
    fs::write(path, text).map_err(|e| format!("Nie można zapisać argumentów Whisper: {e}"))
}

pub fn execute(job: Arc<Job>, tools: Tools, media: PathBuf) -> Result<(Vec<Segment>, f64), String> {
    let temp = tempfile::Builder::new()
        .prefix("autonapisy-")
        .tempdir()
        .map_err(|e| format!("Brak miejsca na pliki tymczasowe: {e}"))?;
    let wav = temp.path().join("audio.wav");
    // Only local file/pipe protocols, first audio stream, no shell interpolation.
    let mut args: Vec<std::ffi::OsString> = [
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
    args.push(media.into_os_string());
    args.extend(
        [
            "-map",
            "0:a:0",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
        ]
        .iter()
        .map(Into::into),
    );
    args.push(wav.clone().into_os_string());
    run_process(
        &job,
        tools.ffmpeg.as_deref().ok_or("Brak FFmpeg")?,
        &args,
        false,
        temp.path(),
    )?;
    recognize(job, tools, temp.path())
}
/// Select only unmuted sound associated with picture. Independent music never enters
/// recognition. Construct audio-only producers with the existing source-clock gains.
pub fn voice_project(
    p: &crate::project::Project,
    selected: Option<&[String]>,
) -> Result<crate::project::Project, String> {
    use crate::project::{Clip, Crossfade, Fade};
    let clips = p.clips.as_deref().unwrap_or(&[]);
    if let Some(ids) = selected {
        if ids.is_empty()
            || ids.len() > 100
            || ids
                .iter()
                .any(|id| !clips.iter().any(|c| &c.id == id && c.kind != "audio"))
        {
            return Err("Zaznacz przynajmniej jeden klip wideo do transkrypcji".into());
        }
    }
    let mut sound: Vec<Clip> = vec![];
    for v in clips
        .iter()
        .filter(|v| v.kind != "audio" && selected.is_none_or(|ids| ids.contains(&v.id)))
    {
        if p.tracks
            .state(&format!("V{}", v.track as u16 + 1))
            .is_some_and(|t| t.muted)
        {
            continue;
        }
        if v.audio_detached {
            for a in clips.iter().filter(|a| {
                a.kind == "audio"
                    && v.sync_group.is_some()
                    && a.sync_group == v.sync_group
                    && a.asset_id == v.asset_id
                    && !p.tracks.audio_muted(a)
                    && a.volume > 0.
            }) {
                if !sound.iter().any(|s| s.id == a.id) {
                    sound.push(a.clone());
                }
            }
        } else if !p.tracks.audio_muted(v) && v.volume > 0. {
            let incoming = p.transitions.iter().find(|t| t.to_id == v.id);
            let outgoing = p.transitions.iter().find(|t| t.from_id == v.id);
            let mut a = v.clone();
            a.kind = "audio".into();
            a.audio_route = None;
            a.track = 0;
            if let Some(t) = incoming {
                a.start -= t.duration;
                a.source_in -= t.duration;
            }
            if incoming.is_some() || outgoing.is_some() {
                a.crossfade = Some(Crossfade {
                    fade_in: incoming.map(|t| Fade {
                        anchor: v.source_in - t.duration,
                        duration: t.duration,
                    }),
                    fade_out: outgoing.map(|t| Fade {
                        anchor: v.source_out,
                        duration: t.duration,
                    }),
                });
            }
            sound.push(a);
        }
    }
    if sound.is_empty() {
        return Err("Brak niewyciszonego dźwięku powiązanego z wybranymi filmami. Osobna muzyka nie jest transkrybowana.".into());
    }
    // Controls have already been applied above, including the original V mute and A route.
    for a in &mut sound {
        a.track = 0;
        a.audio_route = None;
    }
    let mut result = p.clone();
    result.clips = Some(sound);
    result.transitions.clear();
    result.tracks = Default::default();
    Ok(result)
}

pub fn execute_timeline(
    job: Arc<Job>,
    tools: Tools,
    p: crate::project::Project,
) -> Result<(Vec<Segment>, f64), String> {
    let temp = tempfile::Builder::new()
        .prefix("rolvixa-transcript-")
        .tempdir()
        .map_err(|e| e.to_string())?;
    let speech = voice_project(&p, None)?;
    let ranges = crate::timeline_audio::prepare(
        &job,
        tools.ffmpeg.as_deref().ok_or("Brak FFmpeg")?,
        &speech,
        temp.path(),
    )?;
    let (segments, _) = recognize(job, tools, temp.path())?;
    let duration = p
        .clips
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .map(crate::project::Clip::end)
        .fold(0.0, f64::max);
    Ok((crate::timeline_audio::remap(segments, &ranges), duration))
}
pub fn execute_timeline_mlt(
    job: Arc<Job>,
    tools: Tools,
    p: crate::project::Project,
    melt: PathBuf,
) -> Result<(Vec<Segment>, f64), String> {
    execute_timeline_mlt_scoped(job, tools, p, melt, None)
}
pub fn execute_timeline_mlt_scoped(
    job: Arc<Job>,
    tools: Tools,
    p: crate::project::Project,
    melt: PathBuf,
    selected: Option<Vec<String>>,
) -> Result<(Vec<Segment>, f64), String> {
    let speech = voice_project(&p, selected.as_deref())?;
    let temp = tempfile::Builder::new()
        .prefix("rolvixa-mlt-transcript-")
        .tempdir()
        .map_err(|e| e.to_string())?;
    let ranges = crate::timeline_audio::plan(
        &job,
        tools.ffmpeg.as_deref().ok_or("Brak FFmpeg")?,
        &speech,
        temp.path(),
    )?;
    let bounds: Vec<_> = ranges
        .iter()
        .map(|r| {
            (
                crate::mlt::frame(r.timeline_start),
                crate::mlt::frame(r.timeline_start + r.duration),
            )
        })
        .collect();
    let frames: i64 = bounds.iter().map(|(a, b)| b - a).sum();
    let meta = crate::rendering::Metadata {
        width: 2,
        height: 2,
        duration: frames as f64 / 30.,
        has_audio: true,
    };
    fs::write(
        temp.path().join("timeline.mlt"),
        crate::mlt::xml(&speech, &meta, &[], Some(&bounds))?,
    )
    .map_err(|e| e.to_string())?;
    crate::mlt::run(&job, &melt, temp.path(), 0, frames - 1, false, true)?;
    let (segments, _) = recognize(job, tools, temp.path())?;
    Ok((
        crate::timeline_audio::remap(segments, &ranges),
        crate::project::composition_duration(&p),
    ))
}
fn recognize(job: Arc<Job>, tools: Tools, dir: &Path) -> Result<(Vec<Segment>, f64), String> {
    let wav = dir.join("audio.wav");
    let output = dir.join("result");
    job.check()?;
    let reader =
        hound::WavReader::open(&wav).map_err(|e| format!("Nie można odczytać dźwięku: {e}"))?;
    let duration = reader.duration() as f64 / reader.spec().sample_rate as f64;
    drop(reader);
    if duration <= 0.0 {
        return Err("Film nie zawiera dźwięku do transkrypcji".into());
    }
    {
        let mut s = job.status.lock().unwrap();
        if job.cancel.load(Ordering::SeqCst) {
            return Err("Anulowano zadanie".into());
        }
        s.state = "transcribing".into();
        s.message = "Rozpoznawanie polskiej mowy…".into();
        s.progress = None;
    }
    let threads = thread::available_parallelism()
        .map(|n| n.get().min(8))
        .unwrap_or(2)
        .to_string();
    let mut args: Vec<std::ffi::OsString> = vec![
        "-m".into(),
        tools.model.ok_or("Brak modelu")?.into_os_string(),
        "-f".into(),
        "audio.wav".into(),
        "-l".into(),
        "pl".into(),
        "-ng".into(),
        "-t".into(),
        threads.into(),
        "-ojf".into(),
        "-pp".into(),
        "-of".into(),
        "result".into(),
    ];
    // Token timestamps are requested through max-length; split-on-word prevents splitting Polish words.
    args.extend(["-ml".into(), "48".into(), "-sow".into()]);
    // whisper.cpp's Windows CRT argv can lose Unicode. Its response-file support
    // reads UTF-8 bytes verbatim; relative WAV/output names also bypass narrow-path I/O.
    write_response(&dir.join("arguments.txt"), &args)?;
    run_process(
        &job,
        tools.whisper.as_deref().ok_or("Brak Whisper")?,
        &["@arguments.txt".into()],
        true,
        dir,
    )?;
    job.check()?;
    let mut json = String::new();
    fs::File::open(output.with_extension("json"))
        .map_err(|e| format!("Whisper nie utworzył wyniku JSON: {e}"))?
        .take(16 * 1024 * 1024 + 1)
        .read_to_string(&mut json)
        .map_err(|e| e.to_string())?;
    if json.len() > 16 * 1024 * 1024 {
        return Err("Wynik transkrypcji przekracza 16 MB".into());
    }
    let segments = parse_output(&json, duration)?;
    job.check()?;
    Ok((segments, duration))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    #[test]
    fn process_failure_is_reported() {
        let job = Arc::new(Job::new(1));
        let dir = tempfile::tempdir().unwrap();
        let args = vec![
            "-c".into(),
            "echo 'missing audio stream' >&2; exit 7".into(),
        ];
        let result = run_process(&job, Path::new("/bin/sh"), &args, false, dir.path());
        assert!(result.unwrap_err().contains("missing audio stream"));
        assert!(job.child.lock().unwrap().is_none());
    }
    #[cfg(unix)]
    #[test]
    fn cancellation_stops_child_and_reaps_it() {
        let job = Arc::new(Job::new(1));
        let running = Arc::clone(&job);
        let dir = tempfile::tempdir().unwrap();
        let worker = thread::spawn(move || {
            run_process(
                &running,
                Path::new("/bin/sh"),
                &["-c".into(), "exec sleep 30".into()],
                false,
                dir.path(),
            )
        });
        for _ in 0..100 {
            if job.child.lock().unwrap().is_some() {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        job.cancel();
        assert!(worker.join().unwrap().is_err());
        assert!(job.child.lock().unwrap().is_none());
    }
    #[cfg(windows)]
    #[test]
    fn process_failure_is_reported() {
        let job = Arc::new(Job::new(1));
        let dir = tempfile::tempdir().unwrap();
        let result = run_process(
            &job,
            Path::new("C:\\Windows\\System32\\cmd.exe"),
            &["/C".into(), "exit 7".into()],
            false,
            dir.path(),
        );
        assert!(result.is_err());
        assert!(job.child.lock().unwrap().is_none());
    }
    #[test]
    fn unicode_response_file_and_newline_rejection() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("arguments.txt");
        write_response(&file, &["-m".into(), "C:/Łódź/model z odstępem.bin".into()]).unwrap();
        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            "-m\nC:/Łódź/model z odstępem.bin\n"
        );
        assert!(write_response(&file, &["bad\n-l\nen".into()]).is_err());
    }
    #[test]
    fn real_offsets_and_unicode() {
        let json = r#"{"model":{"multilingual":true},"transcription":[{"text":" Zażółć gęślą","offsets":{"from":1000,"to":2500},"tokens":[{"id":100,"text":" Zażółć","offsets":{"from":1000,"to":1500}},{"id":101,"text":" gęślą","offsets":{"from":1500,"to":2500}}]}]}"#;
        let s = parse_output(json, 10.0).unwrap();
        assert_eq!(s[0].start, 1.0);
        assert_eq!(s[0].end, 2.5);
        assert_eq!(s[0].words[1].text, "gęślą");
    }
    #[test]
    fn missing_tokens_do_not_fabricate_words() {
        let s = parse_output(
            r#"{"transcription":[{"text":"Tekst","offsets":{"from":0,"to":1000}}]}"#,
            2.0,
        )
        .unwrap();
        assert!(s[0].words.is_empty());
    }
    #[test]
    fn english_model_and_bad_time_rejected() {
        assert!(parse_output(
            r#"{"model":{"multilingual":false},"transcription":[]}"#,
            1.0
        )
        .is_err());
        assert!(parse_output(
            r#"{"transcription":[{"text":"x","offsets":{"from":1000,"to":-1}}]}"#,
            2.0
        )
        .is_err());
    }
    #[test]
    fn silence_is_empty() {
        assert!(parse_output(r#"{"transcription":[]}"#, 1.0)
            .unwrap()
            .is_empty());
        assert!(parse_output("{}", 1.0).is_err());
    }
    #[test]
    fn progress_is_actual_and_bounded() {
        assert_eq!(
            progress_from_line("whisper_print_progress_callback: progress =  35%"),
            Some(35)
        );
        assert_eq!(progress_from_line("progress = 101%"), None);
        assert_eq!(progress_from_line("loading model"), None);
    }
    #[test]
    fn cancel_is_terminal_and_idempotent() {
        let j = Job::new(1);
        j.cancel();
        assert!(j.check().is_err());
        assert!(j.active());
        j.cancel();
    }
    #[test]
    fn no_cancellation_after_success() {
        let j = Job::new(1);
        j.status.lock().unwrap().state = "completed".into();
        j.cancel();
        assert!(!j.cancel.load(Ordering::SeqCst));
        assert!(!j.active());
    }
    #[test]
    fn wrong_executable_and_english_filename_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("shell.exe");
        fs::write(&p, b"x").unwrap();
        assert!(validate_tool("ffmpeg", &p).is_err());
        let m = dir.path().join("ggml-small.en.bin");
        fs::write(&m, [0x6c, 0x6d, 0x67, 0x67]).unwrap();
        assert!(validate_tool("model", &m).is_err());
    }
    #[test]
    fn result_is_clipped_to_audio_not_extended() {
        let s = parse_output(
            r#"{"transcription":[{"text":"x","offsets":{"from":0,"to":3000}}]}"#,
            2.0,
        )
        .unwrap();
        assert_eq!(s[0].end, 2.0);
    }
}

#[cfg(test)]
mod speech_selection_tests {
    use super::*;
    use crate::project;
    fn sample() -> project::Project {
        project::parse(&serde_json::json!({"schemaVersion":14,"name":"Mowa Łódź","media":{"path":"Łódź.mp4","name":"Film","duration":20},"clips":[{"id":"v","kind":"video","start":2,"sourceIn":1,"sourceOut":5,"audioRoute":"A2"},{"id":"music","kind":"audio","start":0,"sourceIn":0,"sourceOut":12}],"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-17T00:00:00Z","updatedAt":"2026-10-17T00:00:00Z"}).to_string()).unwrap()
    }
    #[test]
    fn excludes_independent_music_and_checks_selected_ids() {
        let p = sample();
        let s = voice_project(&p, None).unwrap();
        assert_eq!(s.clips.as_ref().unwrap().len(), 1);
        assert_eq!(s.clips.as_ref().unwrap()[0].id, "v");
        assert!(voice_project(&p, Some(&[])).is_err());
        assert!(voice_project(&p, Some(&["music".into()])).is_err());
        assert!(voice_project(&p, Some(&["unknown".into()])).is_err());
    }
    #[test]
    fn honors_original_bus_and_picture_mute_but_eye_is_visual_only() {
        let mut p = sample();
        p.tracks.v1.hidden = true;
        assert!(voice_project(&p, None).is_ok());
        p.tracks.a2.muted = true;
        assert!(voice_project(&p, None).is_err());
        p.tracks.a2.muted = false;
        p.tracks.v1.muted = true;
        assert!(voice_project(&p, None).is_err());
        p.tracks.v1.muted = false;
        p.clips.as_mut().unwrap()[0].volume = 0.;
        assert!(voice_project(&p, None).is_err());
    }
    #[test]
    fn linked_j_l_sound_uses_own_gain_and_is_not_duplicated() {
        let mut p = sample();
        let clips = p.clips.as_mut().unwrap();
        clips[0].audio_detached = true;
        clips[0].sync_group = Some("pair".into());
        let mut a = clips[1].clone();
        a.id = "linked".into();
        a.sync_group = Some("pair".into());
        a.start = 1.5;
        a.source_in = 0.5;
        a.source_out = 5.;
        a.volume = 0.4;
        a.track = 1;
        clips.push(a);
        let q = voice_project(&p, Some(&["v".into()])).unwrap();
        let a = &q.clips.unwrap()[0];
        assert_eq!(a.id, "linked");
        assert_eq!(
            (a.start, a.source_in, a.source_out, a.volume),
            (1.5, 0.5, 5., 0.4)
        );
        p.tracks.a2.muted = true;
        assert!(voice_project(&p, None).is_err());
    }
    #[test]
    fn selected_transition_side_keeps_linear_crossfade_in_source_clock() {
        let mut p = sample();
        let mut b = p.clips.as_ref().unwrap()[0].clone();
        b.id = "b".into();
        b.start = 6.;
        b.source_in = 2.;
        b.source_out = 6.;
        p.clips.as_mut().unwrap().push(b);
        p.transitions.push(project::Transition {
            id: "t".into(),
            from_id: "v".into(),
            to_id: "b".into(),
            kind: "fade".into(),
            duration: 0.5,
        });
        let q = voice_project(&p, Some(&["b".into()])).unwrap();
        let a = &q.clips.as_ref().unwrap()[0];
        assert_eq!((a.start, a.source_in), (5.5, 1.5));
        assert_eq!(
            a.crossfade
                .as_ref()
                .unwrap()
                .fade_in
                .as_ref()
                .unwrap()
                .anchor,
            1.5
        );
        assert!(q.transitions.is_empty());
        assert!((crate::audio_envelope::gain(a, 1.75) - 0.5).abs() < 1e-6);
    }
    #[test]
    fn caption_offsets_roundtrip_and_reject_old_schema_and_out_of_range() {
        let p = sample();
        let mut v = serde_json::to_value(p).unwrap();
        v["captionEdits"] =
            serde_json::json!({"timeline:a":{"trimStart":0,"trimEnd":0,"offset":-2.5}});
        let p = project::parse(&v.to_string()).unwrap();
        assert_eq!(p.caption_edits["timeline:a"].offset, Some(-2.5));
        v["schemaVersion"] = 13.into();
        assert!(project::parse(&v.to_string()).is_err());
        v["schemaVersion"] = 14.into();
        v["captionEdits"]["timeline:a"]["offset"] = 86401.into();
        assert!(project::parse(&v.to_string()).is_err());
    }
}
