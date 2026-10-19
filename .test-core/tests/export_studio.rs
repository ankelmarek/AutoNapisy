use autonapisy_core_tests::{
    export_studio::{preview, Options, Queue},
    project,
    transcription::Job,
};
use std::{
    fs,
    path::Path,
    process::Command,
    sync::Arc,
    time::{Duration, Instant},
};
fn run(ff: &Path, args: &[&str], out: &Path) {
    let o = Command::new(ff).args(args).arg(out).output().unwrap();
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
}
fn seed(voice: &Path) -> project::Project {
    let mut v: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/smartcut030.json")).unwrap();
    let p = &mut v["cut"];
    p["name"] = "Eksport Łódź".into();
    p["media"]["path"] = voice.to_str().unwrap().into();
    p["media"]["duration"] = 2.into();
    p["assets"] = serde_json::json!([]);
    p["clips"] = serde_json::json!([{"id":"voice","kind":"video","start":0,"sourceIn":0,"sourceOut":2,"volume":0.6,"audioRoute":"A1"}]);
    p["segments"] = serde_json::json!([{"id":"s","start":0.4,"end":1.6,"text":"Zażółć gęślą","styleId":"default","words":[]}]);
    p["timelineSegments"] = serde_json::Value::Null;
    p["captionEdits"] = serde_json::json!({});
    project::parse(&p.to_string()).unwrap()
}
fn frame(ff: &Path, path: &Path) -> Vec<u8> {
    let o = Command::new(ff)
        .args(["-v", "error", "-ss", "0.8", "-i"])
        .arg(path)
        .args([
            "-frames:v",
            "1",
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
fn wait(q: &Queue) {
    let end = Instant::now() + Duration::from_secs(60);
    loop {
        let rows = q.list();
        assert!(rows.iter().filter(|r| r.state == "rendering").count() <= 1);
        if rows
            .iter()
            .all(|r| ["completed", "failed", "cancelled"].contains(&r.state.as_str()))
        {
            break;
        }
        assert!(Instant::now() < end, "queue stuck");
        std::thread::sleep(Duration::from_millis(20));
    }
}
fn png(w: u32, h: u32) -> Vec<u8> {
    let mut data = vec![0; w as usize * h as usize * 4];
    for y in h / 2..h {
        for x in 0..w {
            let i = ((y * w + x) * 4) as usize;
            data[i..i + 4].copy_from_slice(&[255, 255, 0, 255]);
        }
    }
    let mut out = Vec::new();
    {
        let mut e = png::Encoder::new(&mut out, w, h);
        e.set_color(png::ColorType::Rgba);
        e.set_depth(png::BitDepth::Eight);
        e.write_header().unwrap().write_image_data(&data).unwrap();
    }
    out
}
#[test]
#[ignore = "requires actual MLT and FFmpeg"]
fn actual_queue_profiles_srt_burn_cancel_retry_and_collision() {
    let ff = std::path::PathBuf::from(std::env::var_os("AUTONAPISY_FFMPEG").unwrap());
    let melt = fs::canonicalize(std::env::var_os("ROLVIXA_MLT").unwrap()).unwrap();
    let d = tempfile::tempdir().unwrap();
    let voice = d.path().join("Źródło Łódź.mp4");
    run(
        &ff,
        &[
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=red:s=320x180:r=30:d=2",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=300:sample_rate=48000:duration=2",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
        ],
        &voice,
    );
    let p = seed(&voice);
    let saved = serde_json::to_string(&p).unwrap();
    let opts = Options {
        width: Some(128),
        height: Some(224),
        speed: "fast".into(),
        captions: "none".into(),
        ..Default::default()
    };
    let job = Arc::new(Job::new(0));
    let (a, w, h) = preview(&job, &ff, &melt, &p, &opts, 0.8).unwrap();
    assert_eq!((w, h), (128, 224));
    assert!(a.len() > 100);
    let q = Arc::new(Queue::default());
    let first = q
        .prepare(p.clone(), opts.clone(), d.path(), ff.clone(), melt.clone())
        .unwrap();
    q.ready(first.id).unwrap();
    let srt = q
        .prepare(
            p.clone(),
            Options {
                captions: "srt".into(),
                ..opts.clone()
            },
            d.path(),
            ff.clone(),
            melt.clone(),
        )
        .unwrap();
    q.ready(srt.id).unwrap();
    q.cancel(srt.id).unwrap();
    assert_eq!(q.get(srt.id).unwrap().item().state, "cancelled");
    q.retry(srt.id).unwrap();
    let burned = q
        .prepare(
            p.clone(),
            Options {
                captions: "burn".into(),
                ..opts.clone()
            },
            d.path(),
            ff.clone(),
            melt.clone(),
        )
        .unwrap();
    assert!(q.ready(burned.id).is_err());
    assert!(burned.upload(1, &png(128, 224)).is_err());
    assert!(burned.upload(0, &png(130, 224)).is_err());
    burned.upload(0, &png(128, 224)).unwrap();
    assert!(burned.upload(0, &png(128, 224)).is_err());
    q.ready(burned.id).unwrap();
    wait(&q);
    for row in q.list() {
        assert_eq!(row.state, "completed", "{}", row.message);
    }
    assert_ne!(first.target, srt.target);
    assert!(fs::read_to_string(srt.target.with_extension("srt"))
        .unwrap()
        .contains("Zażółć gęślą"));
    assert!(!first.target.with_extension("srt").exists());
    let plain = frame(&ff, &first.target);
    let burn = frame(&ff, &burned.target);
    let top = 10 * 128 * 3 + 20 * 3;
    assert!(plain[top] < 10 && plain[top + 1] < 10);
    let lower = (170 * 128 + 64) * 3;
    assert!(burn[lower] > 200 && burn[lower + 1] > 200);
    assert!(plain[lower] < 10);
    let srt_pic = frame(&ff, &srt.target);
    assert!(
        plain
            .iter()
            .zip(&srt_pic)
            .map(|(a, b)| (*a as i32 - *b as i32).abs())
            .sum::<i32>()
            < 10000
    );
    let probe = ff.parent().unwrap().join(if cfg!(windows) {
        "ffprobe.exe"
    } else {
        "ffprobe"
    });
    let o = Command::new(probe)
        .args(["-v", "error", "-show_streams", "-of", "json"])
        .arg(&first.target)
        .output()
        .unwrap();
    let v: serde_json::Value = serde_json::from_slice(&o.stdout).unwrap();
    assert_eq!(v["streams"][0]["width"], 128);
    assert_eq!(v["streams"][0]["height"], 224);
    assert_eq!(v["streams"][0]["codec_name"], "h264");
    assert_eq!(v["streams"][0]["r_frame_rate"], "30/1");
    assert_eq!(v["streams"][1]["codec_name"], "aac");
    let raced = q
        .prepare(p.clone(), opts.clone(), d.path(), ff.clone(), melt.clone())
        .unwrap();
    fs::write(&raced.target, b"external").unwrap();
    q.ready(raced.id).unwrap();
    wait(&q);
    assert_eq!(raced.item().state, "failed");
    assert_eq!(fs::read(&raced.target).unwrap(), b"external");
    fs::remove_file(&raced.target).unwrap();
    q.retry(raced.id).unwrap();
    wait(&q);
    assert_eq!(raced.item().state, "completed");
    let changed = q.prepare(p.clone(), opts, d.path(), ff, melt).unwrap();
    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&voice)
        .unwrap();
    use std::io::Write;
    file.write_all(&[0]).unwrap();
    drop(file);
    q.ready(changed.id).unwrap();
    wait(&q);
    assert_eq!(changed.item().state, "failed");
    assert!(!changed.target.exists());
    assert!(changed.item().message.contains("zmieniły"));
    assert_eq!(serde_json::to_string(&p).unwrap(), saved);
    q.shutdown();
    println!("Actual Export Studio: original MLT FFV1/float to single H.264/AAC, 30 FPS, fit/crop preview, sequential MP4/SRT/burn, no overwrite, queued cancellation/retry and changed-source guard: OK");
}
