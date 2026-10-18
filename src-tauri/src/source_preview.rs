//! Small stills decoded by FFmpeg, independent of WebView codec support.
use crate::transcription::{self, Job};
use std::{ffi::OsString, path::Path};
pub fn frame(
    job: &std::sync::Arc<Job>,
    ffmpeg: &Path,
    path: &Path,
    time: f64,
) -> Result<Vec<u8>, String> {
    if !time.is_finite() || !(0.0..=86400.0).contains(&time) {
        return Err("Nieprawidłowy czas miniatury".into());
    }
    let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let output = dir.path().join("frame.png");
    let mut args: Vec<OsString> = [
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-ss",
        &time.to_string(),
        "-protocol_whitelist",
        "file,pipe",
        "-i",
    ]
    .iter()
    .map(Into::into)
    .collect();
    args.push(path.as_os_str().into());
    args.extend(["-an","-frames:v","1","-vf","scale=240:136:force_original_aspect_ratio=decrease,pad=240:136:(ow-iw)/2:(oh-ih)/2,setsar=1","-threads","1"].iter().map(OsString::from));
    args.push(output.clone().into());
    transcription::run_process(job, ffmpeg, &args, false, dir.path())?;
    let bytes = std::fs::read(output).map_err(|e| e.to_string())?;
    if bytes.len() > 256 * 1024 {
        return Err("Zbyt duża miniatura".into());
    }
    Ok(bytes)
}
