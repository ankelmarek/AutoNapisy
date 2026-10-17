//! Real render verifies reordered colors, black/silent gaps, audio, and source preservation.
use autonapisy_core_tests::{project, rendering, transcription::Job};
use std::{fs, path::Path, process::Command, sync::Arc};
fn run(ffmpeg: &Path, args: &[&str]) {
    let out = Command::new(ffmpeg).args(args).output().unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
}
fn pixel(ffmpeg: &Path, file: &Path, time: &str) -> Vec<u8> {
    let out = Command::new(ffmpeg)
        .args(["-v", "error", "-ss", time, "-i"])
        .arg(file)
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
    assert!(out.status.success());
    out.stdout
}
fn rms(ffmpeg: &Path, file: &Path, time: &str) -> f64 {
    let out = Command::new(ffmpeg)
        .args(["-v", "error", "-ss", time, "-i"])
        .arg(file)
        .args([
            "-t", "0.4", "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "pipe:1",
        ])
        .output()
        .unwrap();
    assert!(out.status.success());
    let data: Vec<f64> = out
        .stdout
        .chunks_exact(2)
        .map(|b| i16::from_le_bytes([b[0], b[1]]) as f64)
        .collect();
    assert!(data.len() > 1000);
    (data.iter().map(|n| n * n).sum::<f64>() / data.len() as f64).sqrt()
}
#[test]
#[ignore = "requires AUTONAPISY_FFMPEG; generates all test material locally"]
fn real_montage_video_audio_gaps_and_no_audio() {
    let ffmpeg =
        std::path::PathBuf::from(std::env::var("AUTONAPISY_FFMPEG").expect("AUTONAPISY_FFMPEG"));
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("Źródło Łódź.mp4");
    let source_text = source.to_str().unwrap();
    run(
        &ffmpeg,
        &[
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=red:s=160x90:r=30:d=2",
            "-f",
            "lavfi",
            "-i",
            "color=c=green:s=160x90:r=30:d=2",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=160x90:r=30:d=2",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=6",
            "-filter_complex",
            "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
            "-map",
            "[v]",
            "-map",
            "3:a",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            source_text,
        ],
    );
    let original = fs::read(&source).unwrap();
    for audio in [true, false] {
        let input = if audio {
            source.clone()
        } else {
            let p = dir.path().join("Bez dźwięku.mp4");
            run(
                &ffmpeg,
                &[
                    "-v",
                    "error",
                    "-y",
                    "-i",
                    source_text,
                    "-an",
                    "-c:v",
                    "copy",
                    p.to_str().unwrap(),
                ],
            );
            p
        };
        let mut p=project::parse(&serde_json::json!({"schemaVersion":3,"name":"Montaż testowy","media":{"path":input.to_str().unwrap(),"name":"test","duration":6},"clips":[{"id":"blue","sourceIn":4,"sourceOut":6,"start":0},{"id":"red","sourceIn":0,"sourceOut":1,"start":3},{"id":"red-tail","sourceIn":1,"sourceOut":2,"start":4}],"segments":[],"styles":{"default":{"fontFamily":"Bebas Neue","fontSize":56,"color":"#080808","background":"#ffe600","position":"bottom"}},"createdAt":"2026-10-16T00:00:00Z","updatedAt":"2026-10-16T00:00:00Z"}).to_string()).unwrap();
        if audio {
            let caps = r#"[{"id":"caption","text":"test","start":0.5,"end":1.5,"words":[],"styleId":"default"}]"#;
            p.segments = project::export_captions(&p, Some(caps)).unwrap();
            let file = fs::File::create(dir.path().join(rendering::frame_name(0))).unwrap();
            let mut encoder = png::Encoder::new(file, 160, 90);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder
                .write_header()
                .unwrap()
                .write_image_data(&[255, 230, 0, 255].repeat(160 * 90))
                .unwrap();
        }
        let job = Arc::new(Job::new(1));
        job.status.lock().unwrap().state = "rendering".into();
        let mut meta = rendering::inspect(&job, &ffmpeg, &input, dir.path()).unwrap();
        assert_eq!(meta.has_audio, audio);
        meta.duration = project::composition_duration(&p);
        assert_eq!(meta.duration, 5.0);
        let target = dir.path().join(if audio {
            "Montaż z audio.mp4"
        } else {
            "Montaż bez audio.mp4"
        });
        rendering::render(&job, &ffmpeg, &input, &target, &None, dir.path(), &p, &meta).unwrap();
        let output =
            rendering::inspect(&Arc::new(Job::new(2)), &ffmpeg, &target, dir.path()).unwrap();
        assert!(
            (output.duration - 5.0).abs() < 0.1,
            "duration {}",
            output.duration
        );
        let blue = pixel(&ffmpeg, &target, "0.2");
        assert!(blue[2] > 180 && blue[0] < 35, "blue {blue:?}");
        if audio {
            let yellow = pixel(&ffmpeg, &target, "1.0");
            assert!(
                yellow[0] > 180 && yellow[1] > 160 && yellow[2] < 50,
                "caption {yellow:?}"
            );
        }
        let black = pixel(&ffmpeg, &target, "2.5");
        assert!(black.iter().all(|n| *n < 15), "gap {black:?}");
        for time in ["3.5", "4.5"] {
            let red = pixel(&ffmpeg, &target, time);
            assert!(red[0] > 180 && red[2] < 35, "red {red:?}");
        }
        assert!(rms(&ffmpeg, &target, "2.2") < 50.0, "gap must be silent");
        if audio {
            assert!(rms(&ffmpeg, &target, "0.3") > 500.0);
            assert!(rms(&ffmpeg, &target, "3.2") > 500.0);
        } else {
            assert!(rms(&ffmpeg, &target, "0.3") < 50.0);
        }
        assert_eq!(job.status.lock().unwrap().state, "completed");
    }
    assert_eq!(fs::read(&source).unwrap(), original);
    println!("Reorder, trims, black gaps, audio/silence, no-audio input and Unicode paths: OK");
}

#[test]
#[ignore = "requires AUTONAPISY_FFMPEG"]
fn real_two_video_two_audio_mix() {
    let ffmpeg = std::path::PathBuf::from(std::env::var("AUTONAPISY_FFMPEG").unwrap());
    let dir = tempfile::tempdir().unwrap();
    let red = dir.path().join("Dolny Łódź.mp4");
    let blue = dir.path().join("Górny żółć.mp4");
    let music = dir.path().join("Muzyka.wav");
    for (file, color, freq) in [(&red, "red", "440"), (&blue, "blue", "880")] {
        run(
            &ffmpeg,
            &[
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                &format!("color=c={color}:s=160x90:r=30:d=4"),
                "-f",
                "lavfi",
                "-i",
                &format!("sine=frequency={freq}:duration=4"),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                file.to_str().unwrap(),
            ],
        );
    }
    run(
        &ffmpeg,
        &[
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=1320:duration=5",
            "-c:a",
            "pcm_s16le",
            music.to_str().unwrap(),
        ],
    );
    let originals: Vec<_> = [&red, &blue, &music]
        .iter()
        .map(|p| fs::read(p).unwrap())
        .collect();
    let mut p=project::parse(&serde_json::json!({"schemaVersion":4,"name":"Dwie ścieżki","media":{"path":red,"name":"red","duration":4},"assets":[{"id":"upper","path":blue,"name":"blue","duration":4,"kind":"video","segments":[]},{"id":"music","path":music,"name":"muzyka","duration":5,"kind":"audio","segments":[]}],"clips":[{"id":"bottom","sourceIn":0,"sourceOut":4,"start":0,"track":0,"volume":0.5},{"id":"top","sourceIn":0,"sourceOut":2,"start":1,"track":1,"assetId":"upper","volume":0.5},{"id":"music","sourceIn":0,"sourceOut":5,"start":0,"track":1,"kind":"audio","assetId":"music","volume":0.5}],"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#111111","position":"bottom"}},"createdAt":"2026-10-16T00:00:00Z","updatedAt":"2026-10-16T00:00:00Z"}).to_string()).unwrap();
    // Two audio buses can contain linked video sound plus independent music.
    let job = Arc::new(Job::new(100));
    job.status.lock().unwrap().state = "rendering".into();
    let mut meta = rendering::inspect(&job, &ffmpeg, &red, dir.path()).unwrap();
    meta.duration = project::composition_duration(&p);
    let target = dir.path().join("Miks.mp4");
    rendering::render(&job, &ffmpeg, &red, &target, &None, dir.path(), &p, &meta).unwrap();
    for t in ["0.4", "3.4"] {
        let c = pixel(&ffmpeg, &target, t);
        assert!(c[0] > 180 && c[2] < 35, "bottom {t}: {c:?}");
    }
    let c = pixel(&ffmpeg, &target, "1.4");
    assert!(c[2] > 180 && c[0] < 35, "upper: {c:?}");
    assert!(pixel(&ffmpeg, &target, "4.4").iter().all(|n| *n < 15));
    let sound = Command::new(&ffmpeg)
        .args(["-v", "error", "-ss", "1.4", "-i"])
        .arg(&target)
        .args([
            "-t", "0.5", "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1",
        ])
        .output()
        .unwrap();
    assert!(sound.status.success());
    let samples: Vec<_> = sound
        .stdout
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()) as f64)
        .collect();
    let energy = |freq: f64| {
        let (mut re, mut im) = (0.0, 0.0);
        for (i, x) in samples.iter().enumerate() {
            let phase = std::f64::consts::TAU * freq * i as f64 / 48000.0;
            re += x * phase.cos();
            im += x * phase.sin();
        }
        (re * re + im * im).sqrt() / samples.len() as f64
    };
    for freq in [440.0, 880.0, 1320.0] {
        assert!(
            energy(freq) > 0.01,
            "missing mixed frequency {freq}: {}",
            energy(freq)
        );
    }
    assert!(energy(2000.0) < 0.002);
    assert!(
        rms(&ffmpeg, &target, "4.2") > 500.0,
        "music must continue over black picture"
    );
    for (i, file) in [&red, &blue, &music].iter().enumerate() {
        assert_eq!(fs::read(file).unwrap(), originals[i]);
    }
    // Native validation mirrors frontend: cross-track overlap accepted, same-track rejected.
    p.clips.as_mut().unwrap()[1].track = 0;
    assert!(project::parse(&serde_json::to_string(&p).unwrap()).is_err());
    println!("Two video layers, linked sound, three mixed frequencies, independent music and Unicode: OK");
}

#[test]
#[ignore = "requires AUTONAPISY_FFMPEG"]
fn real_transitions_correction_and_waveform() {
    let ffmpeg = std::path::PathBuf::from(std::env::var("AUTONAPISY_FFMPEG").unwrap());
    let dir = tempfile::tempdir().unwrap();
    let red = dir.path().join("Czerwony Łódź.mp4");
    let blue = dir.path().join("Niebieski.mp4");
    for (file, color, freq) in [(&red, "red", "440"), (&blue, "blue", "880")] {
        run(
            &ffmpeg,
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
                &format!("sine=frequency={freq}:duration=2"),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                file.to_str().unwrap(),
            ],
        );
    }
    let original = fs::read(&red).unwrap();
    for kind in autonapisy_core_tests::effects::KINDS {
        let p=project::parse(&serde_json::json!({"schemaVersion":6,"name":"Przejścia","media":{"path":red,"name":"red","duration":2},"assets":[{"id":"blue","path":blue,"name":"blue","duration":2,"kind":"video","segments":[]}],"clips":[{"id":"a","start":0,"sourceIn":0,"sourceOut":2},{"id":"b","assetId":"blue","start":2,"sourceIn":1,"sourceOut":2}],"transitions":[{"id":"t","fromId":"a","toId":"b","kind":kind,"duration":1}],"captionEdits":{},"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-17T00:00:00Z","updatedAt":"2026-10-17T00:00:00Z"}).to_string()).unwrap();
        let job = Arc::new(Job::new(10));
        job.status.lock().unwrap().state = "rendering".into();
        let mut meta = rendering::inspect(&job, &ffmpeg, &red, dir.path()).unwrap();
        meta.duration = project::composition_duration(&p);
        let target = dir.path().join(format!("{kind}.mp4"));
        rendering::render(&job, &ffmpeg, &red, &target, &None, dir.path(), &p, &meta).unwrap();
        assert!(
            (rendering::inspect(&Arc::new(Job::new(11)), &ffmpeg, &target, dir.path())
                .unwrap()
                .duration
                - 3.0)
                .abs()
                < 0.1
        );
        let before = pixel(&ffmpeg, &target, "0.5");
        let after = pixel(&ffmpeg, &target, "2.5");
        assert!(before[0] > 180 && after[2] > 180);
        let middle = pixel(&ffmpeg, &target, "1.5");
        if *kind == "fadeblack" {
            assert!(middle.iter().all(|v| *v < 100), "dip {middle:?}");
        } else if *kind == "fade" {
            assert!(middle[0] > 70 && middle[2] > 70, "fade {middle:?}");
        }
        let preview = autonapisy_core_tests::transition_preview::render(
            &Arc::new(Job::new(40)),
            &ffmpeg,
            &p,
            &p.transitions[0],
            dir.path(),
        )
        .unwrap();
        assert!(
            rendering::inspect(&Arc::new(Job::new(41)), &ffmpeg, &preview, dir.path())
                .unwrap()
                .duration
                >= 0.95
        );
        assert!(rms(&ffmpeg, &target, "1.3") > 300.0);
    }
    let peaks =
        autonapisy_core_tests::waveform::analyze(&Arc::new(Job::new(20)), &ffmpeg, &red, 2.0)
            .unwrap();
    assert!(!peaks.peaks.is_empty() && peaks.peaks.len() <= 4096);
    assert!(peaks.peaks.iter().any(|p| *p > 0.1));
    assert!(peaks.step > 0.0);
    // Correction darkens true pixels, not merely the preview style.
    let mut p=project::parse(&serde_json::json!({"schemaVersion":5,"name":"Korekcja","media":{"path":red,"name":"red","duration":2},"assets":[],"clips":[{"id":"a","start":0,"sourceIn":0,"sourceOut":2,"adjustments":{"brightness":0.5,"contrast":1,"saturation":0}}],"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-17T00:00:00Z","updatedAt":"2026-10-17T00:00:00Z"}).to_string()).unwrap();
    let job = Arc::new(Job::new(30));
    job.status.lock().unwrap().state = "rendering".into();
    let meta = rendering::inspect(&job, &ffmpeg, &red, dir.path()).unwrap();
    let target = dir.path().join("Korekcja.mp4");
    rendering::render(&job, &ffmpeg, &red, &target, &None, dir.path(), &p, &meta).unwrap();
    let gray = pixel(&ffmpeg, &target, "0.5");
    assert!(
        (gray[0] as i32 - gray[2] as i32).abs() < 8 && gray[0] < 60,
        "gray {gray:?}"
    );
    p.transitions
        .push(autonapisy_core_tests::project::Transition {
            id: "bad".into(),
            from_id: "a".into(),
            to_id: "missing".into(),
            kind: "left".into(),
            duration: 0.5,
        });
    assert!(project::parse(&serde_json::to_string(&p).unwrap()).is_err());
    assert_eq!(fs::read(&red).unwrap(), original);

    // Recognition audio contains trimmed parts only, skips empty timeline gaps and never opens an unused library item.
    p.clips = Some(vec![
        project::Clip {
            id: "one".into(),
            start: 0.,
            source_in: 1.,
            source_out: 2.,
            kind: "video".into(),
            volume: 1.,
            ..Default::default()
        },
        project::Clip {
            id: "two".into(),
            start: 3.,
            source_in: 0.5,
            source_out: 1.5,
            kind: "video".into(),
            volume: 1.,
            ..Default::default()
        },
    ]);
    p.transitions.clear();
    p.assets.push(project::Asset {
        id: "unused".into(),
        path: "missing-and-unused.mp4".into(),
        name: "Unused".into(),
        kind: "video".into(),
        duration: 999.,
        segments: vec![],
    });
    let ranges = autonapisy_core_tests::timeline_audio::prepare(
        &Arc::new(Job::new(50)),
        &ffmpeg,
        &p,
        dir.path(),
    )
    .unwrap();
    assert_eq!(ranges.len(), 2);
    assert_eq!(ranges[1].timeline_start, 3.);
    let reader = hound::WavReader::open(dir.path().join("audio.wav")).unwrap();
    assert!((reader.duration() as f64 / 16000. - 2.).abs() < 0.01);
    println!("All 20 xfade effects in export and preview, timeline-only audio, correction and waveform: OK");
}
