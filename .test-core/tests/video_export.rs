//! Opt-in end-to-end export: real FFmpeg/FFprobe and a PNG from the browser renderer.
use autonapisy_core_tests::{
    project, rendering,
    transcription::{ExportInfo, Job},
};
use std::{fs, path::PathBuf, sync::Arc};
#[test]
#[ignore = "requires AUTONAPISY_FFMPEG, AUTONAPISY_VIDEO_SAMPLE and AUTONAPISY_CAPTION_PNG"]
fn real_mp4_export_and_cancel_preserves_destination() {
    let path = |key: &str| PathBuf::from(std::env::var(key).expect(key));
    let ffmpeg = path("AUTONAPISY_FFMPEG");
    let sample = fs::canonicalize(path("AUTONAPISY_VIDEO_SAMPLE")).unwrap();
    let png = fs::read(path("AUTONAPISY_CAPTION_PNG")).unwrap();
    let requested = std::env::var("AUTONAPISY_EXPORT_RESULT")
        .ok()
        .map(PathBuf::from);
    let dir = match &requested {
        Some(path) => tempfile::tempdir_in(path.parent().unwrap()).unwrap(),
        None => tempfile::tempdir().unwrap(),
    };
    let target = requested.unwrap_or_else(|| dir.path().join("Wynik Łódź.mp4"));
    fs::write(&target, b"previous export").unwrap();
    let original = rendering::fingerprint(&target).unwrap();
    let job = Arc::new(Job::new(1));
    let meta = rendering::inspect(&job, &ffmpeg, &sample, dir.path()).unwrap();
    rendering::validate_frame(&png, &meta).unwrap();
    fs::write(dir.path().join(rendering::frame_name(0)), png).unwrap();
    let project=project::parse(r##"{"schemaVersion":2,"name":"Smoke test","media":null,"segments":[{"id":"one","text":"ALE PRZEDE MNĄ KIEROWCA\nCAŁEGO WOJEWÓDZTWA","start":0.5,"end":1.5,"words":[],"styleId":"default"}],"styles":{"default":{"fontFamily":"Bebas Neue","fontSize":56,"color":"#080808","background":"#ffe600","position":"bottom"}},"createdAt":"2026-10-16T00:00:00Z","updatedAt":"2026-10-16T00:00:00Z"}"##).unwrap();
    {
        let mut s = job.status.lock().unwrap();
        s.state = "rendering".into();
        s.export_info = Some(ExportInfo {
            width: meta.width,
            height: meta.height,
            duration: meta.duration,
            frames: 1,
            received: 1,
            output_path: target.to_str().unwrap().into(),
        });
    }
    rendering::render(
        &job,
        &ffmpeg,
        &sample,
        &target,
        &original,
        dir.path(),
        &project,
        &meta,
    )
    .unwrap();
    assert_eq!(job.status.lock().unwrap().state, "completed");
    assert!(fs::metadata(&target).unwrap().len() > 1000);
    let output = rendering::inspect(&Arc::new(Job::new(2)), &ffmpeg, &target, dir.path()).unwrap();
    assert_eq!((output.width, output.height), (meta.width, meta.height));
    assert!((output.duration - meta.duration).abs() < 0.15);
    let before = fs::read(&target).unwrap();
    let cancelled = Arc::new(Job::new(3));
    cancelled.status.lock().unwrap().state = "rendering".into();
    cancelled.cancel();
    assert!(rendering::render(
        &cancelled,
        &ffmpeg,
        &sample,
        &target,
        &rendering::fingerprint(&target).unwrap(),
        dir.path(),
        &project,
        &meta
    )
    .is_err());
    assert_eq!(fs::read(&target).unwrap(), before);
    println!(
        "MP4 export OK: {}x{}, {:.3}s; prior destination preserved on cancel",
        output.width, output.height, output.duration
    );
}
