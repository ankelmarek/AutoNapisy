//! Opt-in test using real, separately installed tools and an explicitly supplied local sample.
use autonapisy_core_tests::transcription::{execute, Job, Tools};
use std::{path::PathBuf, sync::Arc};
#[test]
#[ignore = "requires AUTONAPISY_FFMPEG, AUTONAPISY_WHISPER, AUTONAPISY_MODEL, AUTONAPISY_SAMPLE"]
fn real_local_transcription() {
    let path = |key: &str| PathBuf::from(std::env::var(key).expect(key));
    let tools = Tools {
        ffmpeg: Some(path("AUTONAPISY_FFMPEG")),
        whisper: Some(path("AUTONAPISY_WHISPER")),
        model: Some(path("AUTONAPISY_MODEL")),
    }
    .validated()
    .unwrap();
    let sample = std::fs::canonicalize(path("AUTONAPISY_SAMPLE")).unwrap();
    let (segments, duration) = execute(Arc::new(Job::new(1)), tools, sample).unwrap();
    assert!(duration > 0.0);
    assert!(!segments.is_empty(), "Sample must contain speech");
    for segment in &segments {
        assert!(segment.start >= 0.0 && segment.end > segment.start && segment.end <= duration);
    }
    println!(
        "Local tools smoke test: {} segments, {:.2}s audio",
        segments.len(),
        duration
    );
}

#[test]
#[ignore = "requires real FFmpeg, whisper.cpp, GGML model and local speech sample"]
fn real_timeline_transcription() {
    use autonapisy_core_tests::{project, transcription::execute_timeline};
    let path = |key: &str| PathBuf::from(std::env::var(key).expect(key));
    let tools = Tools {
        ffmpeg: Some(path("AUTONAPISY_FFMPEG")),
        whisper: Some(path("AUTONAPISY_WHISPER")),
        model: Some(path("AUTONAPISY_MODEL")),
    }
    .validated()
    .unwrap();
    let sample = std::fs::canonicalize(path("AUTONAPISY_SAMPLE")).unwrap();
    let p=project::parse(&serde_json::json!({"schemaVersion":6,"name":"Real recognition","media":{"path":sample,"name":"Speech","duration":1},"clips":[{"id":"a","start":3,"sourceIn":0,"sourceOut":1},{"id":"b","start":4,"sourceIn":0.2,"sourceOut":1}],"transitions":[{"id":"t","fromId":"a","toId":"b","kind":"fade","duration":0.2}],"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-17T00:00:00Z","updatedAt":"2026-10-17T00:00:00Z"}).to_string()).unwrap();
    let (segments, duration) = execute_timeline(Arc::new(Job::new(2)), tools, p).unwrap();
    assert!(!segments.is_empty());
    assert!((duration - 4.8).abs() < 0.001);
    assert!(segments.iter().all(|s| s.start >= 3. && s.end <= 4.8));
    println!("Real Whisper + trimmed montage + active transition: {} segments at correct timeline positions",segments.len());
}
