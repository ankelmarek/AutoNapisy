use autonapisy_core_tests::{
    framing, mlt, project, rendering, transcription::Job, transition_preview,
};
use std::{fs, path::Path, process::Command, sync::Arc};
fn rgb(ff: &Path, file: &Path, x: u32, y: u32, time: &str) -> Vec<u8> {
    let out = Command::new(ff)
        .args(["-v", "error", "-ss", time, "-i"])
        .arg(file)
        .args([
            "-frames:v",
            "1",
            "-vf",
            &format!("crop=2:2:{x}:{y},scale=1:1"),
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
    out.stdout
}
#[test]
#[ignore = "requires ROLVIXA_MLT and AUTONAPISY_FFMPEG"]
fn actual_canvas_pan_zoom_and_transition() {
    let ff = std::path::PathBuf::from(std::env::var("AUTONAPISY_FFMPEG").unwrap());
    let melt = fs::canonicalize(std::env::var("ROLVIXA_MLT").unwrap()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("Kadr Łódź.mp4");
    let output = Command::new(&ff)
        .args([
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=red:s=256x128:r=30:d=1,drawbox=x=128:y=0:w=128:h=128:c=blue:t=fill",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
        ])
        .arg(&source)
        .output()
        .unwrap();
    assert!(output.status.success());
    let mut p=project::parse(&serde_json::json!({"schemaVersion":8,"name":"Kadrowanie","canvas":{"width":128,"height":192},"media":{"path":source,"name":"Kadr","duration":1},"clips":[{"id":"a","start":0,"sourceIn":0,"sourceOut":1}],"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-17T00:00:00Z","updatedAt":"2026-10-17T00:00:00Z"}).to_string()).unwrap();
    let job = Arc::new(Job::new(0));
    let mut meta = rendering::inspect(&job, &ff, &source, dir.path()).unwrap();
    framing::apply_canvas(&p, &mut meta);
    for (label, transform, expected) in [
        ("fit", None, None),
        (
            "red",
            Some(project::Transform {
                scale: 3.,
                x: 0.5,
                y: 0.,
            }),
            Some(0),
        ),
        (
            "blue",
            Some(project::Transform {
                scale: 3.,
                x: -0.5,
                y: 0.,
            }),
            Some(2),
        ),
    ] {
        p.clips.as_mut().unwrap()[0].transform = transform;
        let target = dir.path().join(label);
        fs::create_dir(&target).unwrap();
        let out = mlt::assemble(&job, &melt, &ff, &p, &meta, &target).unwrap();
        if let Ok(dest) = std::env::var("ROLVIXA_CAPTURE_FRAMING") {
            std::fs::copy(&out, format!("{dest}-{label}.mp4")).unwrap();
            std::fs::copy(target.join("timeline.mlt"), format!("{dest}-{label}.mlt")).unwrap();
        }
        let actual = rendering::inspect(&job, &ff, &out, &target).unwrap();
        assert_eq!((actual.width, actual.height), (128, 192));
        if let Some(channel) = expected {
            for (x, y) in [(8, 8), (112, 8), (8, 180), (112, 180)] {
                let px = rgb(&ff, &out, x, y, "0.2");
                assert!(px[channel] > 180, "{label} {x},{y}: {px:?}");
            }
        } else {
            assert!(rgb(&ff, &out, 8, 8, "0.2").iter().all(|v| *v < 20));
            assert!(rgb(&ff, &out, 8, 96, "0.2")[0] > 180);
            assert!(rgb(&ff, &out, 112, 96, "0.2")[2] > 180);
        }
    }
    p.clips = Some(vec![
        project::Clip {
            id: "a".into(),
            kind: "video".into(),
            source_out: 0.5,
            volume: 1.,
            transform: Some(project::Transform {
                scale: 3.,
                x: 0.5,
                y: 0.,
            }),
            ..Default::default()
        },
        project::Clip {
            id: "b".into(),
            kind: "video".into(),
            start: 0.5,
            source_in: 0.5,
            source_out: 1.,
            volume: 1.,
            transform: Some(project::Transform {
                scale: 3.,
                x: -0.5,
                y: 0.,
            }),
            ..Default::default()
        },
    ]);
    p.transitions = vec![project::Transition {
        id: "t".into(),
        from_id: "a".into(),
        to_id: "b".into(),
        kind: "fade".into(),
        duration: 0.2,
    }];
    let fx = dir.path().join("transition");
    fs::create_dir(&fx).unwrap();
    let out =
        transition_preview::render_sized(&job, &ff, &p, &p.transitions[0], &fx, None).unwrap();
    let px = rgb(&ff, &out, 64, 96, "0.1");
    assert!(
        px[0] > 60 && px[2] > 60,
        "Framed xfade must combine transformed red and blue: {px:?}"
    );
    println!("MLT/FFmpeg: portrait canvas, fit, zoom, pan and framed transition: OK");
}
