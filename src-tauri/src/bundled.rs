//! Resolve only fixed resource names. Never searches PATH or downloads components.
use crate::transcription::Tools;
use std::path::Path;
pub fn apply_defaults(settings: &mut Tools, resource_dir: &Path) {
    let vendor = resource_dir.join("vendor");
    // Explicit user choices win while valid; stale paths from an older install fall back.
    if settings.ffmpeg.as_ref().map_or(true, |p| !p.is_file()) {
        let ffmpeg = vendor.join("ffmpeg.exe");
        if ffmpeg.is_file() && vendor.join("ffprobe.exe").is_file() {
            settings.ffmpeg = Some(ffmpeg);
        }
    }
    if settings.whisper.as_ref().map_or(true, |p| !p.is_file()) {
        let whisper = vendor.join("whisper-cli.exe");
        if whisper.is_file() { settings.whisper = Some(whisper); }
    }
    // Models are deliberately never guessed or fetched.
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[test]
    fn local_bundle_defaults_preserve_user_choices_and_model() {
        let dir = tempfile::tempdir().unwrap();
        let vendor = dir.path().join("vendor"); fs::create_dir(&vendor).unwrap();
        for name in ["ffmpeg.exe", "ffprobe.exe", "whisper-cli.exe"] { fs::write(vendor.join(name), b"fixture").unwrap(); }
        let mut tools = Tools::default(); apply_defaults(&mut tools, dir.path());
        assert_eq!(tools.ffmpeg, Some(vendor.join("ffmpeg.exe"))); assert!(tools.whisper.is_some()); assert!(tools.model.is_none());
        let custom = dir.path().join("Mój ffmpeg.exe"); fs::write(&custom,b"fixture").unwrap();
        tools.ffmpeg = Some(custom.clone()); apply_defaults(&mut tools, dir.path()); assert_eq!(tools.ffmpeg,Some(custom));
        tools.ffmpeg=Some(dir.path().join("deleted.exe")); apply_defaults(&mut tools,dir.path()); assert_eq!(tools.ffmpeg,Some(vendor.join("ffmpeg.exe")));
    }
    #[test]
    fn partial_bundle_is_not_reported_as_ready() {
        let dir=tempfile::tempdir().unwrap();fs::create_dir(dir.path().join("vendor")).unwrap();fs::write(dir.path().join("vendor/ffmpeg.exe"),b"fixture").unwrap();
        let mut tools=Tools::default();apply_defaults(&mut tools,dir.path());assert!(tools.ffmpeg.is_none());assert!(tools.whisper.is_none());
    }
}
