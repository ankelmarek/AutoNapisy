//! Replacement metadata, stable cuts and actual decoded output in both engines.
use autonapisy_core_tests::{
    media_sources, mlt, montage, project, proxy, rendering, source_preview, transcription::Job,
    waveform,
};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
};
fn run(ff: &Path, args: &[&str]) {
    let out = Command::new(ff).args(args).output().unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
}
fn pixel(ff: &Path, path: &Path, time: &str) -> Vec<u8> {
    let out = Command::new(ff)
        .args(["-v", "error", "-ss", time, "-i"])
        .arg(path)
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
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert_eq!(out.stdout.len(), 3);
    out.stdout
}
#[test]
#[ignore = "requires real FFmpeg, FFprobe and MLT"]
fn unicode_replacement_preserves_cuts_and_rebuilds_actual_media() {
    let ff = PathBuf::from(std::env::var("AUTONAPISY_FFMPEG").unwrap());
    let melt = fs::canonicalize(std::env::var("ROLVIXA_MLT").unwrap()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let job = Arc::new(Job::new(1));
    let mut files = Vec::new();
    for (name, color, hz, d) in [
        ("Źródło Łódź 日本.mp4", "red", 440, 4),
        ("Zamiennik żółć.mp4", "blue", 880, 6),
        ("Za krótki.mp4", "lime", 330, 1),
    ] {
        let path = dir.path().join(name);
        run(
            &ff,
            &[
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                &format!("color=c={color}:s=160x90:r=30:d={d}"),
                "-f",
                "lavfi",
                "-i",
                &format!("sine=frequency={hz}:sample_rate=48000:duration={d}"),
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                path.to_str().unwrap(),
            ],
        );
        files.push(fs::canonicalize(path).unwrap());
    }
    let bytes: Vec<_> = files.iter().map(|f| fs::read(f).unwrap()).collect();
    let p=project::parse(&serde_json::json!({"schemaVersion":11,"name":"Podmiana","media":{"path":files[0],"name":"Źródło","duration":4},"assets":[],"clips":[{"id":"first","sourceIn":0.5,"sourceOut":2,"start":0,"volume":0.4,"audioRoute":"embedded","audio":{"points":[{"id":"p","time":1,"gain":0.7}]}},{"id":"second","sourceIn":2,"sourceOut":4,"start":1.5,"audioRoute":"A2"}],"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-18T00:00:00Z","updatedAt":"2026-10-18T00:00:00Z"}).to_string()).unwrap();
    let info = media_sources::inspect(&job, &ff, &files[1]).unwrap();
    assert_eq!(info.video_streams, 1);
    assert_eq!(info.audio_streams, 1);
    assert!((info.duration - 6.).abs() < 0.05);
    let short = media_sources::inspect(&job, &ff, &files[2]).unwrap();
    assert!(short.duration < p.clips.as_ref().unwrap()[1].source_out);
    let old_stamp = proxy::stamp(&files[0]).unwrap();
    let new_stamp = proxy::stamp(&files[1]).unwrap();
    assert_ne!(proxy::key(&old_stamp, 540), proxy::key(&new_stamp, 540));
    let mut next = p.clone();
    next.media.as_mut().unwrap().path = files[1].to_str().unwrap().into();
    next.media.as_mut().unwrap().duration = Some(info.duration);
    let next = project::parse(&serde_json::to_string(&next).unwrap()).unwrap();
    assert_eq!(
        serde_json::to_value(&next.clips).unwrap(),
        serde_json::to_value(&p.clips).unwrap()
    );
    assert_eq!(
        project::composition_duration(&p),
        project::composition_duration(&next)
    );
    assert_ne!(
        source_preview::frame(&job, &ff, &files[0], 0.5).unwrap(),
        source_preview::frame(&job, &ff, &files[1], 0.5).unwrap()
    );
    assert!(!waveform::analyze(&job, &ff, &files[1], info.duration)
        .unwrap()
        .peaks
        .is_empty());
    let meta = rendering::Metadata {
        width: 160,
        height: 90,
        duration: 3.5,
        has_audio: true,
    };
    for (label, proj, channel) in [("old", &p, 0), ("new", &next, 2)] {
        for native in [false, true] {
            let out = dir.path().join(format!("{label}-{native}"));
            fs::create_dir(&out).unwrap();
            let result = if native {
                mlt::assemble(&job, &melt, &ff, proj, &meta, &out).unwrap()
            } else {
                montage::assemble(
                    &job,
                    &ff,
                    Path::new(&proj.media.as_ref().unwrap().path),
                    &out,
                    proj,
                    &meta,
                )
                .unwrap()
            };
            for t in ["0.5", "2.5"] {
                let px = pixel(&ff, &result, t);
                assert!(px[channel] > 180, "{label}/{native}/{t}: {px:?}");
            }
        }
    }
    for (i, f) in files.iter().enumerate() {
        assert_eq!(fs::read(f).unwrap(), bytes[i], "Never modify originals");
    }
    let corrupt = dir.path().join("Uszkodzony.mp4");
    fs::write(&corrupt, b"not video").unwrap();
    assert!(media_sources::inspect(&job, &ff, &corrupt).is_err());
    fs::write(&files[1], b"changed after selection").unwrap();
    assert_ne!(
        new_stamp,
        proxy::stamp(&files[1]).unwrap(),
        "Candidate changed after probing must be rejected"
    );
}
