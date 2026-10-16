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
pub struct Status {
    pub id: u64,
    pub state: String,
    pub message: String,
    /// Real percentage reported by whisper, not an estimate for the whole job.
    pub progress: Option<u8>,
    pub segments: Option<Vec<Segment>>,
    pub audio_duration: Option<f64>,
}
pub struct Job {
    pub cancel: AtomicBool,
    pub status: Mutex<Status>,
    child: Mutex<Option<Child>>,
}
impl Job {
    pub fn new(id: u64) -> Self {
        Self {
            cancel: AtomicBool::new(false),
            child: Mutex::new(None),
            status: Mutex::new(Status {
                id,
                state: "preparing".into(),
                message: "Przygotowywanie dźwięku…".into(),
                progress: None,
                segments: None,
                audio_duration: None,
            }),
        }
    }
    pub fn active(&self) -> bool {
        let s = self.status.lock().unwrap();
        matches!(
            s.state.as_str(),
            "preparing" | "transcribing" | "cancelling"
        )
    }
    pub fn cancel(&self) {
        // Share the status lock with completion so cancellation cannot turn a completed job into a running one.
        let mut status = self.status.lock().unwrap();
        if !matches!(
            status.state.as_str(),
            "preparing" | "transcribing" | "cancelling"
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
    fn check(&self) -> Result<(), String> {
        if self.cancel.load(Ordering::SeqCst) {
            Err("Anulowano transkrypcję".into())
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

fn run_process(
    job: &Arc<Job>,
    program: &Path,
    args: &[std::ffi::OsString],
    whisper: bool,
    cwd: &Path,
) -> Result<(), String> {
    job.check()?;
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
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
    let result = loop {
        let mut slot = job.child.lock().unwrap();
        let child = slot.as_mut().ok_or("Proces nie istnieje")?;
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
    let output = temp.path().join("result");
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
            return Err("Anulowano transkrypcję".into());
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
    write_response(&temp.path().join("arguments.txt"), &args)?;
    run_process(
        &job,
        tools.whisper.as_deref().ok_or("Brak Whisper")?,
        &["@arguments.txt".into()],
        true,
        temp.path(),
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
