use autonapisy_core_tests::{
    export_studio::{Options, Queue},
    project,
    smart_export::{Sample, SampleRange},
    transcription::Job,
};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
    time::{Duration, Instant},
};
fn run(ff: &Path, args: &[&str], out: &Path) {
    let o = Command::new(ff).args(args).arg(out).output().unwrap();
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
}
fn frame(ff: &Path, path: &Path, t: f64) -> Vec<u8> {
    let o = Command::new(ff)
        .args(["-v", "error", "-ss", &t.to_string(), "-i"])
        .arg(path)
        .args([
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
    assert!(o.status.success());
    o.stdout
}
fn tones(ff: &Path, path: &Path, t: f64) -> [f64; 2] {
    let o = Command::new(ff)
        .args(["-v", "error", "-ss", &t.to_string(), "-i"])
        .arg(path)
        .args([
            "-t", "0.1", "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1",
        ])
        .output()
        .unwrap();
    assert!(o.status.success());
    let values: Vec<f64> = o
        .stdout
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()) as f64)
        .collect();
    assert!(values.len() >= 4700);
    [300., 900.].map(|hz| {
        let (mut a, mut b) = (0., 0.);
        for (i, x) in values.iter().enumerate() {
            let ph = std::f64::consts::TAU * hz * i as f64 / 48000.;
            a += x * ph.cos();
            b += x * ph.sin();
        }
        (a * a + b * b).sqrt() / values.len() as f64
    })
}
fn picture() -> Vec<u8> {
    let mut bytes = Vec::new();
    {
        let mut e = png::Encoder::new(&mut bytes, 128, 224);
        e.set_color(png::ColorType::Rgba);
        e.set_depth(png::BitDepth::Eight);
        let mut data = vec![0; 128 * 224 * 4];
        for y in 150..200 {
            for x in 20..110 {
                let i = (y * 128 + x) * 4;
                data[i..i + 4].copy_from_slice(&[255, 255, 0, 255]);
            }
        }
        e.write_header().unwrap().write_image_data(&data).unwrap();
    }
    bytes
}
fn wait(q: &Queue) {
    let end = Instant::now() + Duration::from_secs(60);
    while q
        .list()
        .iter()
        .any(|s| !["completed", "cancelled", "failed"].contains(&s.state.as_str()))
    {
        assert!(Instant::now() < end);
        std::thread::sleep(Duration::from_millis(20));
    }
}
#[test]
#[ignore = "requires real MLT and FFmpeg"]
fn actual_ab_samples_match_full_montage_audio_captions_and_size_limit() {
    let ff = PathBuf::from(std::env::var_os("AUTONAPISY_FFMPEG").unwrap());
    let melt = fs::canonicalize(std::env::var_os("ROLVIXA_MLT").unwrap()).unwrap();
    let d = tempfile::tempdir().unwrap();
    let source = d.path().join("Próbka Łódź.mp4");
    let music = d.path().join("Muzyka Łódź.wav");
    run(&ff,&["-v","error","-y","-f","lavfi","-i","color=red:s=320x180:r=30:d=6,drawbox=color=blue:t=fill:enable='gte(t,2)',drawbox=color=lime:t=fill:enable='gte(t,4)'","-f","lavfi","-i","sine=frequency=300:sample_rate=48000:duration=6","-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-c:a","aac"],&source);
    run(
        &ff,
        &[
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=900:sample_rate=48000:duration=6",
            "-c:a",
            "pcm_f32le",
        ],
        &music,
    );
    let mut v: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/smartcut030.json")).unwrap();
    let p = &mut v["cut"];
    p["name"] = "A/B Łódź".into();
    p["media"]["path"] = source.to_str().unwrap().into();
    p["media"]["duration"] = 6.into();
    p["assets"] = serde_json::json!([{"id":"music","name":"Muzyka","path":music,"duration":6,"kind":"audio","segments":[]}]);
    p["masterAudio"] = serde_json::json!({"gainDb":-3});
    p["clips"] = serde_json::json!([{"id":"v","kind":"video","start":0,"sourceIn":0,"sourceOut":6,"volume":0.6,"audioRoute":"A1","audio":{"points":[{"id":"p","time":3,"gain":0.5}],"fadeIn":{"anchor":0,"duration":2},"fadeOut":{"anchor":6,"duration":2}}},{"id":"a","assetId":"music","kind":"audio","start":0,"sourceIn":0,"sourceOut":6,"volume":0.3,"track":1}]);
    p["timelineSegments"] = serde_json::Value::Null;
    p["captionEdits"] = serde_json::json!({});
    p["segments"] = serde_json::json!([{"id":"s0","start":0.1,"end":0.5,"text":"poza próbką","words":[],"styleId":"default"},{"id":"s1","start":2.2,"end":3.7,"text":"Zażółć gęślą","words":[],"styleId":"default"}]);
    let p = project::parse(&p.to_string()).unwrap();
    let original = serde_json::to_string(&p).unwrap();
    let o = Options {
        width: Some(128),
        height: Some(224),
        speed: "fast".into(),
        ..Default::default()
    };
    let q = Arc::new(Queue::default());
    let full = q
        .prepare(p.clone(), o.clone(), d.path(), ff.clone(), melt.clone())
        .unwrap();
    for i in 0..2 {
        full.upload(i, &picture()).unwrap();
    }
    q.ready(full.id).unwrap();
    wait(&q);
    assert_eq!(full.item().state, "completed", "{}", full.item().message);
    let job = Arc::new(Job::new(0));
    let sample = Sample::prepare(
        job.clone(),
        p.clone(),
        o.clone(),
        ff.clone(),
        melt.clone(),
        1.,
        4.,
    )
    .unwrap();
    assert_eq!(sample.frames, vec![1]);
    sample.entry.upload(1, &picture()).unwrap();
    let report = sample.run().unwrap();
    assert_eq!(report.measurements.len(), 3);
    assert_eq!(report.range.start, 1.);
    assert_eq!(report.range.duration, 4.);
    for m in &report.measurements {
        assert!(m.bytes > 1000);
        assert!(m.encode_seconds > 0.);
        assert!(m.estimated_seconds[1] >= m.estimated_seconds[0]);
        let path = sample.path(m.index).unwrap();
        for t in [0.3, 1.8, 3.6] {
            let a = frame(&ff, &path, t);
            let b = frame(&ff, &full.target, t + 1.);
            assert_eq!(a.len(), b.len());
            let error = a
                .iter()
                .zip(&b)
                .map(|(a, b)| (*a as f64 - *b as f64).abs())
                .sum::<f64>()
                / a.len() as f64;
            assert!(error < 4., "sample/full picture mismatch {error} at {t}");
            let a = tones(&ff, &path, t);
            let b = tones(&ff, &full.target, t + 1.);
            for i in 0..2 {
                assert!(
                    (a[i] - b[i]).abs() < 0.002,
                    "sample audio mismatch {a:?} / {b:?}"
                );
            }
        }
        let pixels = frame(&ff, &path, 1.8);
        let i = (170 * 128 + 64) * 3;
        assert!(
            pixels[i] > 200 && pixels[i + 1] > 200,
            "caption clock must follow sample offset"
        );
    }
    let busy_source = d.path().join("Szczegółowy ruch Łódź.mp4");
    run(
        &ff,
        &[
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=640x360:rate=30:duration=6",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=300:sample_rate=48000:duration=6",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
        ],
        &busy_source,
    );
    let mut busy = p.clone();
    busy.media.as_mut().unwrap().path = busy_source.to_str().unwrap().into();
    let uncapped = q
        .prepare(
            busy.clone(),
            Options {
                width: Some(640),
                height: Some(360),
                crf: 12,
                audio_kbps: 96,
                captions: "srt".into(),
                ..o.clone()
            },
            d.path(),
            ff.clone(),
            melt.clone(),
        )
        .unwrap();
    q.ready(uncapped.id).unwrap();
    wait(&q);
    assert_eq!(
        uncapped.item().state,
        "completed",
        "{}",
        uncapped.item().message
    );
    assert!(
        fs::metadata(&uncapped.target).unwrap().len() > 250000,
        "CRF reference must exceed the requested cap"
    );
    let capped = q
        .prepare(
            busy.clone(),
            Options {
                width: Some(640),
                height: Some(360),
                target_mb: Some(0.25),
                audio_kbps: 96,
                captions: "srt".into(),
                ..o.clone()
            },
            d.path(),
            ff.clone(),
            melt.clone(),
        )
        .unwrap();
    q.ready(capped.id).unwrap();
    wait(&q);
    assert_eq!(
        capped.item().state,
        "completed",
        "{}",
        capped.item().message
    );
    assert!(fs::metadata(&capped.target).unwrap().len() <= 250000);
    assert!(fs::read_to_string(capped.target.with_extension("srt"))
        .unwrap()
        .contains("Zażółć"));
    let size_sample = Sample::prepare(
        Arc::new(Job::new(0)),
        busy,
        Options {
            width: Some(640),
            height: Some(360),
            target_mb: Some(0.25),
            audio_kbps: 96,
            captions: "none".into(),
            ..o.clone()
        },
        ff.clone(),
        melt.clone(),
        1.,
        3.,
    )
    .unwrap();
    let size_report = size_sample.run().unwrap();
    assert_eq!(size_report.measurements[0].options.target_mb, Some(0.25));
    assert!(fs::metadata(size_sample.path(0).unwrap()).unwrap().len() > 1000);
    assert!(q
        .prepare(
            p.clone(),
            Options {
                target_mb: Some(0.25),
                audio_kbps: 320,
                ..o.clone()
            },
            d.path(),
            ff.clone(),
            melt.clone()
        )
        .is_err());
    let cancel = Arc::new(Job::new(0));
    let cancelled = Sample::prepare(
        cancel.clone(),
        p.clone(),
        Options {
            captions: "none".into(),
            ..o.clone()
        },
        ff.clone(),
        melt.clone(),
        1.,
        4.,
    )
    .unwrap();
    cancel.cancel();
    assert!(cancelled.run().is_err());
    assert!(!cancelled.path(0).unwrap().exists());
    let changed = Sample::prepare(
        Arc::new(Job::new(0)),
        p.clone(),
        Options {
            captions: "none".into(),
            ..o
        },
        ff,
        melt,
        1.,
        4.,
    )
    .unwrap();
    use std::io::Write;
    fs::OpenOptions::new()
        .append(true)
        .open(&source)
        .unwrap()
        .write_all(&[0])
        .unwrap();
    assert!(changed.run().err().unwrap().contains("Źródła zmieniły"));
    assert_eq!(serde_json::to_string(&p).unwrap(), original);
    q.shutdown();
    assert!(SampleRange::new(0., 6., 6.).is_err());
    println!("Export Studio 0.2: real range/MLT/three CRF variants match full picture, source envelopes/master/music and caption clock; two-pass MP4 <= decimal MB, SRT, cancellation, source guard and unchanged project: OK");
}
