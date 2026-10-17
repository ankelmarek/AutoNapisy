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
        if whisper.is_file() {
            settings.whisper = Some(whisper);
        }
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
        let vendor = dir.path().join("vendor");
        fs::create_dir(&vendor).unwrap();
        for name in ["ffmpeg.exe", "ffprobe.exe", "whisper-cli.exe"] {
            fs::write(vendor.join(name), b"fixture").unwrap();
        }
        let mut tools = Tools::default();
        apply_defaults(&mut tools, dir.path());
        assert_eq!(tools.ffmpeg, Some(vendor.join("ffmpeg.exe")));
        assert!(tools.whisper.is_some());
        assert!(tools.model.is_none());
        let custom = dir.path().join("Mój ffmpeg.exe");
        fs::write(&custom, b"fixture").unwrap();
        tools.ffmpeg = Some(custom.clone());
        apply_defaults(&mut tools, dir.path());
        assert_eq!(tools.ffmpeg, Some(custom));
        tools.ffmpeg = Some(dir.path().join("deleted.exe"));
        apply_defaults(&mut tools, dir.path());
        assert_eq!(tools.ffmpeg, Some(vendor.join("ffmpeg.exe")));
    }
    #[test]
    fn partial_bundle_is_not_reported_as_ready() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("vendor")).unwrap();
        fs::write(dir.path().join("vendor/ffmpeg.exe"), b"fixture").unwrap();
        let mut tools = Tools::default();
        apply_defaults(&mut tools, dir.path());
        assert!(tools.ffmpeg.is_none());
        assert!(tools.whisper.is_none());
    }
}

/// A new RolVixa profile may read previous AutoNapisy component choices.
/// Existing RolVixa settings always win; neither profile is overwritten here.
pub fn load_settings(current: &Path, legacy: &Path) -> Tools {
    let path = if current.exists() { current } else { legacy };
    std::fs::metadata(path)
        .ok()
        .filter(|m| m.len() <= 64 * 1024)
        .and_then(|_| std::fs::read(path).ok())
        .and_then(|v| serde_json::from_slice(&v).ok())
        .unwrap_or_default()
}
#[cfg(test)]
mod migration_tests {
    use super::*;
    #[test]
    fn reads_legacy_settings_without_moving_user_files() {
        let dir = tempfile::tempdir().unwrap();
        let old = dir.path().join("AutoNapisy Łódź.json");
        let new = dir.path().join("RolVixa.json");
        let data = br#"{"ffmpeg":null,"whisper":null,"model":"C:/modele/ggml-small.bin"}"#;
        std::fs::write(&old, data).unwrap();
        let settings = load_settings(&new, &old);
        assert_eq!(settings.model, Some("C:/modele/ggml-small.bin".into()));
        assert!(!new.exists());
        assert_eq!(std::fs::read(&old).unwrap(), data);
    }
    #[test]
    fn existing_new_settings_win_and_oversized_legacy_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let old = dir.path().join("old.json");
        let new = dir.path().join("new.json");
        std::fs::write(&old, br#"{"model":"C:/old.bin"}"#).unwrap();
        std::fs::write(&new, br#"{"model":"C:/new.bin"}"#).unwrap();
        assert_eq!(load_settings(&new, &old).model, Some("C:/new.bin".into()));
        std::fs::remove_file(&new).unwrap();
        std::fs::write(&old, vec![b' '; 65537]).unwrap();
        assert!(load_settings(&new, &old).model.is_none());
    }
}
