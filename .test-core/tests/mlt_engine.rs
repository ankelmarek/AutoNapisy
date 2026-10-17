use autonapisy_core_tests::{mlt, project, rendering, transcription::Job};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
};
fn ffmpeg(p: &Path, args: &[&str]) {
    let o = Command::new(p).args(args).output().unwrap();
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
}
fn pixel(ff: &Path, p: &Path, t: &str) -> Vec<u8> {
    let o = Command::new(ff)
        .args(["-v", "error", "-ss", t, "-i"])
        .arg(p)
        .args([
            "-frames:v",
            "1",
            "-vf",
            "scale=1:1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ])
        .output()
        .unwrap();
    assert!(o.status.success());
    o.stdout
}
#[test]
#[ignore = "requires ROLVIXA_MLT and AUTONAPISY_FFMPEG"]
fn actual_mlt_tracks() {
    let melt = PathBuf::from(std::env::var("ROLVIXA_MLT").unwrap());
    let ff = PathBuf::from(std::env::var("AUTONAPISY_FFMPEG").unwrap());
    let dir = tempfile::tempdir().unwrap();
    let red = dir.path().join("Czerwony Łódź.mp4");
    let blue = dir.path().join("Niebieski.mp4");
    for (p, color, hz) in [(&red, "red", 440), (&blue, "blue", 880)] {
        ffmpeg(
            &ff,
            &[
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                &format!("color=c={color}:s=160x90:r=30:d=2"),
                "-f",
                "lavfi",
                "-i",
                &format!("sine=frequency={hz}:duration=2"),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                p.to_str().unwrap(),
            ],
        );
    }
    let mut p=project::parse(&serde_json::json!({"schemaVersion":6,"name":"MLT","media":{"path":red,"name":"red","duration":2},"assets":[{"id":"b","path":blue,"name":"blue","duration":2,"kind":"video","segments":[]}],"clips":[{"id":"red","start":0,"sourceIn":0,"sourceOut":1},{"id":"red-cut","start":1,"sourceIn":1,"sourceOut":2},{"id":"blue","assetId":"b","track":1,"start":0.5,"sourceIn":0,"sourceOut":1},{"id":"after","assetId":"b","start":3,"sourceIn":1,"sourceOut":2}],"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-17T00:00:00Z","updatedAt":"2026-10-17T00:00:00Z"}).to_string()).unwrap();
    let job = Arc::new(Job::new(1));
    let mut meta = rendering::inspect(&job, &ff, &red, dir.path()).unwrap();
    meta.duration = 4.;
    let out = mlt::assemble(&job, &melt, &ff, &p, &meta, dir.path()).unwrap();
    for (t, color) in [("0.2", 0), ("0.8", 2), ("1.8", 0), ("3.5", 2)] {
        let px = pixel(&ff, &out, t);
        assert!(px[color] > 180, "{t}: {px:?}");
    }
    let gap = pixel(&ff, &out, "2.5");
    assert!(gap.iter().all(|v| *v < 20), "gap {gap:?}");
    assert!(
        (rendering::inspect(&job, &ff, &out, dir.path())
            .unwrap()
            .duration
            - 4.)
            .abs()
            < 0.1
    );
    p.clips = Some(vec![
        project::Clip {
            id: "a".into(),
            source_in: 0.,
            source_out: 2.,
            kind: "video".into(),
            volume: 1.,
            ..Default::default()
        },
        project::Clip {
            id: "b".into(),
            start: 2.,
            source_in: 0.5,
            source_out: 2.,
            asset_id: Some("b".into()),
            kind: "video".into(),
            volume: 1.,
            ..Default::default()
        },
    ]);
    p.transitions = vec![project::Transition {
        id: "t".into(),
        from_id: "a".into(),
        to_id: "b".into(),
        kind: "fade".into(),
        duration: 0.5,
    }];
    let overlaydir = dir.path().join("fade");
    fs::create_dir(&overlaydir).unwrap();
    let out = mlt::assemble(&job, &melt, &ff, &p, &meta, &overlaydir).unwrap();
    let mid = pixel(&ff, &out, "1.75");
    assert!(mid[0] > 60 && mid[2] > 60, "transition {mid:?}");

    let previewdir = dir.path().join("stream");
    fs::create_dir(&previewdir).unwrap();
    mlt::prepare(&job, &ff, &p, &meta, &previewdir, true).unwrap();
    let stream = mlt::run(&job, &melt, &previewdir, 15, 104, true, false).unwrap();
    let raw = fs::read(&stream).unwrap();
    assert!(raw.windows(4).any(|b| b == b"moof"));
    if let Ok(dest) = std::env::var("ROLVIXA_CAPTURE_PREVIEW") {
        fs::copy(&stream, dest).unwrap();
    }
    let audiodir = dir.path().join("audio");
    fs::create_dir(&audiodir).unwrap();
    let ranges = autonapisy_core_tests::timeline_audio::plan(&job, &ff, &p, &audiodir).unwrap();
    let bounds: Vec<_> = ranges
        .iter()
        .map(|r| {
            (
                mlt::frame(r.timeline_start),
                mlt::frame(r.timeline_start + r.duration),
            )
        })
        .collect();
    let frames: i64 = bounds.iter().map(|(a, b)| b - a).sum();
    fs::write(
        audiodir.join("timeline.mlt"),
        mlt::xml(&p, &meta, &[], Some(&bounds)).unwrap(),
    )
    .unwrap();
    let wav = mlt::run(&job, &melt, &audiodir, 0, frames - 1, false, true).unwrap();
    let reader = hound::WavReader::open(wav).unwrap();
    assert!((reader.duration() as f64 / 16000. - frames as f64 / 30.).abs() < 0.01);
    p.transitions.clear();
    p.clips.as_mut().unwrap().truncate(1);
    p.clips.as_mut().unwrap()[0].adjustments = Some(project::Adjustments {
        brightness: 0.5,
        contrast: 1.,
        saturation: 0.,
    });
    let corrected = dir.path().join("corrected");
    fs::create_dir(&corrected).unwrap();
    let out = mlt::assemble(&job, &melt, &ff, &p, &meta, &corrected).unwrap();
    let gray = pixel(&ff, &out, "0.3");
    assert!(
        (gray[0] as i32 - gray[2] as i32).abs() < 15 && gray[0] < 70,
        "correction {gray:?}"
    );
    // Measure linked sound, independent sound, mixing and clip gain in the actual engine.
    p.clips.as_mut().unwrap()[0].adjustments = None;
    let mut levels = vec![];
    for (label, volume, independent) in [("full", 1., false), ("half", 0.5, false), ("mix", 1., true)] {
        p.clips.as_mut().unwrap().truncate(1);
        p.clips.as_mut().unwrap()[0].volume = volume;
        if independent {
            p.clips.as_mut().unwrap().push(project::Clip {
                id: "sound".into(), kind: "audio".into(), asset_id: Some("b".into()),
                track: 1, source_out: 2., volume: 0.5, ..Default::default()
            });
        }
        let audio = dir.path().join(label);
        fs::create_dir(&audio).unwrap();
        fs::write(audio.join("timeline.mlt"), mlt::xml(&p, &meta, &[], Some(&[(0, 60)])).unwrap()).unwrap();
        let wav = mlt::run(&job, &melt, &audio, 0, 59, false, true).unwrap();
        let mut reader = hound::WavReader::open(wav).unwrap();
        let samples: Vec<_> = reader.samples::<i16>().skip(8000).take(16000).map(|x| x.unwrap() as f64).collect();
        levels.push((samples.iter().map(|x| x*x).sum::<f64>() / samples.len() as f64).sqrt());
    }
    let half = levels[1] / levels[0];
    let mixed = levels[2] / levels[0];
    assert!((half - 0.5).abs() < 0.04, "volume RMS {levels:?}");
    assert!((mixed - 1.25_f64.sqrt()).abs() < 0.05, "audio mix RMS {levels:?}");
    println!("MLT actual layers, cuts, gap, Unicode, transitions, audio mixing and gain: OK");
}
