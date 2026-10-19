//! Analyze the actual PCM sent to Whisper, without substituting a transcription result.
use autonapisy_core_tests::{
    mlt, project, rendering, timeline_audio,
    transcription::{voice_project, Job},
};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
};
fn generate(ff: &Path, path: &Path, hz: u32, video: bool) {
    let mut c = Command::new(ff);
    c.args(["-v", "error", "-y"]);
    if video {
        c.args(["-f", "lavfi", "-i", "color=red:s=64x64:r=30:d=12"]);
    }
    c.args([
        "-f",
        "lavfi",
        "-i",
        &format!("sine=frequency={hz}:sample_rate=48000:duration=12"),
    ]);
    if video {
        c.args([
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
        ]);
    }
    c.args(["-c:a", "pcm_s16le"]).arg(path);
    let o = c.output().unwrap();
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
}
fn tones(file: &Path, time: f64) -> [f64; 3] {
    let mut r = hound::WavReader::open(file).unwrap();
    let hz = r.spec().sample_rate as usize;
    let values: Vec<f64> = r
        .samples::<i16>()
        .skip((time * hz as f64) as usize)
        .take(hz / 5)
        .map(|v| v.unwrap() as f64 / 32768.)
        .collect();
    assert_eq!(values.len(), hz / 5);
    [300., 600., 900.].map(|f| {
        let (mut x, mut y) = (0., 0.);
        for (i, s) in values.iter().enumerate() {
            let ph = std::f64::consts::TAU * f * i as f64 / hz as f64;
            x += s * ph.cos();
            y += s * ph.sin();
        }
        (x * x + y * y).sqrt() / values.len() as f64
    })
}
#[test]
#[ignore = "requires real MLT and FFmpeg"]
fn recognition_pcm_excludes_music_muted_video_and_handles_selection_detached_sound_and_gaps() {
    let ff = PathBuf::from(std::env::var_os("AUTONAPISY_FFMPEG").unwrap());
    let melt = fs::canonicalize(std::env::var_os("ROLVIXA_MLT").unwrap()).unwrap();
    let d = tempfile::tempdir().unwrap();
    let a = d.path().join("Głos pierwszy Łódź.mkv");
    let b = d.path().join("Głos drugi Łódź.mkv");
    let music = d.path().join("Muzyka Łódź.wav");
    generate(&ff, &a, 300, true);
    generate(&ff, &b, 600, true);
    generate(&ff, &music, 900, false);
    let p=project::parse(&serde_json::json!({"schemaVersion":14,"name":"Speech only","media":{"path":a,"name":"a","duration":12},"assets":[{"id":"b","path":b,"name":"b","duration":12,"kind":"video","segments":[]},{"id":"music","path":music,"name":"Music","duration":12,"kind":"audio","segments":[]}],"tracks":{"V2":{"muted":true}},"clips":[{"id":"a","kind":"video","start":1,"sourceIn":0,"sourceOut":2,"audioRoute":"A2","volume":0.8},{"id":"b","kind":"video","assetId":"b","start":5,"sourceIn":1,"sourceOut":3,"audioRoute":"embedded"},{"id":"muted","kind":"video","track":1,"start":2,"sourceIn":0,"sourceOut":2,"audioRoute":"embedded"},{"id":"music","kind":"audio","assetId":"music","start":0,"sourceIn":0,"sourceOut":10},{"id":"detached-picture","kind":"video","assetId":"b","start":8,"sourceIn":1,"sourceOut":3,"audioDetached":true,"audioRoute":"embedded","syncGroup":"pair"},{"id":"linked","kind":"audio","assetId":"b","start":7.5,"sourceIn":0.5,"sourceOut":3.5,"track":1,"syncGroup":"pair","volume":0.6}],"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-19T00:00:00Z","updatedAt":"2026-10-19T00:00:00Z"}).to_string()).unwrap();
    let job = Arc::new(Job::new(29));
    for (mode, selection, expected) in [
        ("all", None, vec![(1., 2.), (5., 2.), (7.5, 3.)]),
        ("selected", Some(vec!["b".into()]), vec![(5., 2.)]),
        (
            "detached",
            Some(vec!["detached-picture".into()]),
            vec![(7.5, 3.)],
        ),
    ] {
        let speech = voice_project(&p, selection.as_deref()).unwrap();
        assert!(speech
            .clips
            .as_ref()
            .unwrap()
            .iter()
            .all(|c| c.kind == "audio"));
        for engine in ["mlt", "ffmpeg"] {
            let dir = d.path().join(format!("{mode}-{engine}"));
            fs::create_dir(&dir).unwrap();
            let ranges = if engine == "mlt" {
                timeline_audio::plan(&job, &ff, &speech, &dir).unwrap()
            } else {
                timeline_audio::prepare(&job, &ff, &speech, &dir).unwrap()
            };
            assert_eq!(
                ranges
                    .iter()
                    .map(|r| (r.timeline_start, r.duration))
                    .collect::<Vec<_>>(),
                expected
            );
            if engine == "mlt" {
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
                let meta = rendering::Metadata {
                    width: 2,
                    height: 2,
                    duration: frames as f64 / 30.,
                    has_audio: true,
                };
                fs::write(
                    dir.join("timeline.mlt"),
                    mlt::xml(&speech, &meta, &[], Some(&bounds)).unwrap(),
                )
                .unwrap();
                mlt::run(&job, &melt, &dir, 0, frames - 1, false, true).unwrap();
            }
            let wav = dir.join("audio.wav");
            let reader = hound::WavReader::open(&wav).unwrap();
            assert!(
                (reader.duration() as f64 / 16000. - expected.iter().map(|r| r.1).sum::<f64>())
                    .abs()
                    < 0.01
            );
            drop(reader);
            for (index, r) in ranges.iter().enumerate() {
                let t = tones(&wav, r.audio_start + 0.8);
                let wanted = if mode == "all" && index == 0 { 0 } else { 1 };
                assert!(t[wanted] > 0.02, "{mode}/{engine} missing voice {t:?}");
                assert!(
                    t[2] < 0.0005,
                    "music entered recognition {mode}/{engine}: {t:?}"
                );
                assert!(
                    t[1 - wanted] < 0.0005,
                    "other voice entered selection {mode}/{engine}: {t:?}"
                );
            }
        }
    }
    // Only the selected side of an active transition is recognized, retaining its fade.
    let mut cross = p.clone();
    cross.tracks = Default::default();
    cross
        .clips
        .as_mut()
        .unwrap()
        .retain(|c| c.id == "a" || c.id == "b");
    cross.clips.as_mut().unwrap()[1].start = 3.;
    cross.transitions = vec![project::Transition {
        id: "transition".into(),
        from_id: "a".into(),
        to_id: "b".into(),
        kind: "fade".into(),
        duration: 0.5,
    }];
    let speech = voice_project(&cross, Some(&["b".into()])).unwrap();
    let c = &speech.clips.as_ref().unwrap()[0];
    assert_eq!((c.start, c.source_in), (2.5, 0.5));
    assert!((autonapisy_core_tests::audio_envelope::gain(c, 0.75) - 0.5).abs() < 1e-6);
    println!("Actual Whisper PCM: whole/selected/detached, Unicode, source trims/J-L, muted V, independent music excluded, gap compression and both MLT/FFmpeg: OK");
}
