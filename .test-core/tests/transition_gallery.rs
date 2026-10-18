//! Compare the shipped gallery movies against the actual timeline transition renderer.
use autonapisy_core_tests::{effects, project, transcription::Job, transition_preview};
use std::{path::Path, process::Command, sync::Arc};
fn run(ffmpeg: &Path, args: &[&str]) {
    let out = Command::new(ffmpeg).args(args).output().unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
}
fn frames(ffmpeg: &Path, file: &Path, offset: u32) -> Vec<u8> {
    let filter = format!(
        "select='eq(n,{})+eq(n,{})+eq(n,{})',scale=64:64:flags=area",
        6 + offset,
        15 + offset,
        24 + offset
    );
    let out = Command::new(ffmpeg)
        .args(["-v", "error", "-i"])
        .arg(file)
        .args([
            "-vf",
            &filter,
            "-fps_mode",
            "passthrough",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ])
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert_eq!(out.stdout.len(), 3 * 64 * 64 * 3);
    out.stdout
}
#[test]
#[ignore = "requires AUTONAPISY_FFMPEG; compares all 20 bundled demos with production xfade"]
fn real_gallery_matches_timeline_transition_frames() {
    let ffmpeg = std::path::PathBuf::from(std::env::var_os("AUTONAPISY_FFMPEG").unwrap());
    let dir = tempfile::tempdir().unwrap();
    let gallery = Path::new(env!("CARGO_MANIFEST_DIR")).join("../public/transition-demos");
    let a = dir.path().join("Obraz A Łódź.mp4");
    let b = dir.path().join("Obraz B Łódź.mp4");
    for (key, file) in [("a", &a), ("b", &b)] {
        run(
            &ffmpeg,
            &[
                "-v",
                "error",
                "-y",
                "-loop",
                "1",
                "-framerate",
                "30",
                "-i",
                gallery.join(format!("{key}.png")).to_str().unwrap(),
                "-t",
                "3",
                "-c:v",
                "libx264",
                "-crf",
                "10",
                "-pix_fmt",
                "yuv420p",
                file.to_str().unwrap(),
            ],
        );
    }
    for kind in effects::KINDS {
        let p=project::parse(&serde_json::json!({"schemaVersion":6,"name":"Galeria","media":{"path":a,"name":"A","duration":3},"assets":[{"id":"b","path":b,"name":"B","duration":3,"kind":"video","segments":[]}],"clips":[{"id":"a","start":0,"sourceIn":0,"sourceOut":2},{"id":"b","assetId":"b","start":2,"sourceIn":1,"sourceOut":3}],"transitions":[{"id":"t","fromId":"a","toId":"b","kind":kind,"duration":1}],"captionEdits":{},"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-18T00:00:00Z","updatedAt":"2026-10-18T00:00:00Z"}).to_string()).unwrap();
        let preview = transition_preview::render(
            &Arc::new(Job::new(1)),
            &ffmpeg,
            &p,
            &p.transitions[0],
            dir.path(),
        )
        .unwrap();
        let expected = frames(&ffmpeg, &preview, 0);
        let demo = frames(&ffmpeg, &gallery.join(format!("{kind}.mp4")), 9);
        // Compare spatial structure at 64 px: H.264 compresses high-frequency dissolve noise.
        let error = expected
            .iter()
            .zip(&demo)
            .map(|(a, b)| (*a as f64 - *b as f64).abs())
            .sum::<f64>()
            / expected.len() as f64;
        println!("{kind}: MAE={error}");
        assert!(
            error < 5.0,
            "{kind}: gallery differs from actual transition, MAE={error}"
        );
        if *kind == "slideleft" {
            let wrong = frames(&ffmpeg, &gallery.join("fade.mp4"), 9);
            let wrong_error = expected
                .iter()
                .zip(&wrong)
                .map(|(a, b)| (*a as f64 - *b as f64).abs())
                .sum::<f64>()
                / expected.len() as f64;
            assert!(
                wrong_error > error + 4.0,
                "A generic fade must not pass as a slide demo"
            );
        }
    }
    println!(
        "All 20 shipped gallery movies match production transition pixels at 20/50/80 percent: OK"
    );
}
