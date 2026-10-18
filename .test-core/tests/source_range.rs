use autonapisy_core_tests::{mlt, montage, project, rendering, source_preview, transcription::Job};
use std::{fs, path::Path, process::Command, sync::Arc};
fn pixel(ff: &Path, p: &Path, t: &str) -> Vec<u8> {
    let out = Command::new(ff)
        .args(["-v", "error", "-ss", t, "-i"])
        .arg(p)
        .args([
            "-vf",
            "scale=1:1",
            "-frames:v",
            "1",
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "pipe:1",
        ])
        .output()
        .unwrap();
    assert!(out.status.success());
    out.stdout
}
#[test]
#[ignore = "requires FFmpeg and MLT"]
fn source_frames_and_in_out_match_both_exports() {
    let ff = std::path::PathBuf::from(std::env::var("AUTONAPISY_FFMPEG").unwrap());
    let melt = fs::canonicalize(std::env::var("ROLVIXA_MLT").unwrap()).unwrap();
    let d = tempfile::tempdir().unwrap();
    let source = d.path().join("Źródło Łódź 日本.mp4");
    let out = Command::new(&ff)
        .args([
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=red:s=160x90:r=30:d=2",
            "-f",
            "lavfi",
            "-i",
            "color=blue:s=160x90:r=30:d=2",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=4",
            "-filter_complex",
            "[0:v][1:v]concat=n=2:v=1:a=0[v]",
            "-map",
            "[v]",
            "-map",
            "2:a",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
        ])
        .arg(&source)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let original = fs::read(&source).unwrap();
    let job = Arc::new(Job::new(0));
    for (time, channel) in [(0.5, 0), (2.5, 2)] {
        let bytes = source_preview::frame(&job, &ff, &source, time).unwrap();
        let png = d.path().join(format!("{time}.png"));
        fs::write(&png, bytes).unwrap();
        assert!(pixel(&ff, &png, "0")[channel] > 180);
    }
    assert!(source_preview::frame(&job, &ff, &source, f64::NAN).is_err());
    let p=project::parse(&serde_json::json!({"schemaVersion":9,"name":"Wybrany fragment","media":{"path":source,"name":"Źródło","duration":4},"clips":[{"id":"range","kind":"video","start":0,"sourceIn":1,"sourceOut":3,"volume":1}],"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-17T00:00:00Z","updatedAt":"2026-10-17T00:00:00Z"}).to_string()).unwrap();
    let meta = rendering::inspect(&job, &ff, &source, d.path()).unwrap();
    for label in ["mlt", "ffmpeg"] {
        let dir = d.path().join(label);
        fs::create_dir(&dir).unwrap();
        let out = if label == "mlt" {
            mlt::assemble(&job, &melt, &ff, &p, &meta, &dir).unwrap()
        } else {
            montage::assemble(&job, &ff, &source, &dir, &p, &meta).unwrap()
        };
        let actual = rendering::inspect(&job, &ff, &out, &dir).unwrap();
        assert!(
            (actual.duration - 2.).abs() < 0.12,
            "{label}: {}",
            actual.duration
        );
        assert!(actual.has_audio);
        assert!(pixel(&ff, &out, "0.3")[0] > 180, "{label} source In");
        assert!(pixel(&ff, &out, "1.3")[2] > 180, "{label} source Out");
    }
    assert_eq!(fs::read(source).unwrap(), original);
}
