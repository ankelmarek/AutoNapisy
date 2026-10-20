use autonapisy_core_tests::{caption_stream::CaptionStream, transcription::Job};
use std::{path::PathBuf, process::Command, sync::Arc};
#[test]
#[ignore = "requires real FFmpeg"]
fn actual_lossless_alpha_stream_order_cancel_and_cleanup() {
    let ff = PathBuf::from(std::env::var_os("AUTONAPISY_FFMPEG").unwrap());
    let dir = tempfile::tempdir().unwrap();
    let job = Arc::new(Job::new(1));
    let stream = CaptionStream::start(job.clone(), &ff, dir.path(), 128, 128, 90).unwrap();
    assert!(stream.push(1, vec![0; 128 * 128 * 4]).is_err());
    assert!(stream.push(0, vec![0; 3]).is_err());
    assert!(stream.finish().is_err());
    for frame in 0..90 {
        let pixel = [(frame * 2) as u8, 64, 220, (frame + 30) as u8];
        let data = pixel.repeat(128 * 128);
        stream.push(frame, data).unwrap();
    }
    assert!(stream.push(90, vec![0; 128 * 128 * 4]).is_err());
    stream.finish().unwrap();
    assert!(stream.finish().is_err());
    for frame in [0, 1, 30, 89] {
        let out = Command::new(&ff)
            .args(["-v", "error", "-i"])
            .arg(&stream.output)
            .args([
                "-vf",
                &format!("select=eq(n\\,{frame})"),
                "-frames:v",
                "1",
                "-pix_fmt",
                "rgba",
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
        assert_eq!(
            out.stdout,
            [(frame * 2) as u8, 64, 220, (frame + 30) as u8].repeat(128 * 128)
        );
    }
    drop(stream);
    let cancel = Arc::new(Job::new(2));
    let d = tempfile::tempdir().unwrap();
    let stream = CaptionStream::start(cancel.clone(), &ff, d.path(), 128, 128, 150).unwrap();
    stream.push(0, vec![0; 128 * 128 * 4]).unwrap();
    cancel.cancel();
    assert!(stream.push(1, vec![0; 128 * 128 * 4]).is_err());
    let at = std::time::Instant::now();
    drop(stream);
    assert!(at.elapsed().as_secs() < 3);
    let path = d.path().to_owned();
    drop(d);
    assert!(!path.exists());
    println!("0.33a actual FFV1 RGBA alpha/30 FPS, exact pixels/order, backpressure, cancel/reap and temp cleanup: OK");
}

#[test]
#[ignore = "requires real FFmpeg; production duration and bounded memory"]
fn production_minute_stream_owns_temp_and_invalidates_upload_token() {
    use autonapisy_core_tests::caption_stream::{export_stream, lookup};
    let ff = PathBuf::from(std::env::var_os("AUTONAPISY_FFMPEG").unwrap());
    let dir = Arc::new(tempfile::tempdir().unwrap());
    let path = dir.path().to_owned();
    let job = Arc::new(Job::new(33));
    let at = std::time::Instant::now();
    let (stream, info) = export_stream(job, &ff, dir.clone(), 1280, 720, 2., 60.).unwrap();
    assert_eq!(info.frames, 1800);
    assert_eq!(info.start, 2.);
    assert!(lookup(info.id).is_ok());
    let rss = || {
        std::fs::read_to_string("/proc/self/status")
            .ok()
            .and_then(|s| {
                s.lines()
                    .find(|s| s.starts_with("VmHWM:"))
                    .and_then(|s| s.split_whitespace().nth(1))
                    .and_then(|s| s.parse::<u64>().ok())
            })
    };
    let before = rss();
    for i in 0..info.frames {
        let color = [(i % 255) as u8, 60, 190, 180];
        stream.push(i, color.repeat(1280 * 720)).unwrap();
    }
    stream.finish().unwrap();
    let after = rss();
    if let (Some(a), Some(b)) = (before, after) {
        assert!(
            b.saturating_sub(a) < 192 * 1024,
            "raw frames accumulated: {} KiB",
            b - a
        );
        println!(
            "60s 720p stream parent high-water delta {} KiB",
            b.saturating_sub(a)
        );
    }
    let probe = ff.with_file_name(if cfg!(windows) {
        "ffprobe.exe"
    } else {
        "ffprobe"
    });
    let info_out = Command::new(probe)
        .args([
            "-v",
            "error",
            "-count_frames",
            "-show_entries",
            "stream=nb_read_frames,pix_fmt,r_frame_rate",
            "-of",
            "json",
        ])
        .arg(&stream.output)
        .output()
        .unwrap();
    assert!(info_out.status.success());
    let value: serde_json::Value = serde_json::from_slice(&info_out.stdout).unwrap();
    assert_eq!(value["streams"][0]["nb_read_frames"], "1800");
    assert_eq!(value["streams"][0]["pix_fmt"], "bgra");
    assert_eq!(value["streams"][0]["r_frame_rate"], "30/1");
    println!(
        "0.33c actual 60s/720p/1800-frame alpha: {} bytes in {:.2}s",
        std::fs::metadata(&stream.output).unwrap().len(),
        at.elapsed().as_secs_f64()
    );
    // A concurrent binary request retains the scratch directory until its encoder owner is reaped.
    let in_flight = lookup(info.id).unwrap();
    drop(stream);
    drop(dir);
    assert!(path.exists());
    drop(in_flight);
    assert!(!path.exists());
    assert!(lookup(info.id).is_err());
    let dir = Arc::new(tempfile::tempdir().unwrap());
    let job = Arc::new(Job::new(34));
    let (stream, info) = export_stream(job, &ff, dir.clone(), 128, 128, 0., 10.).unwrap();
    stream.push(0, vec![0; 128 * 128 * 4]).unwrap();
    stream.abort();
    assert!(stream.push(1, vec![0; 128 * 128 * 4]).is_err());
    assert!(!stream.output.exists());
    drop(stream);
    assert!(lookup(info.id).is_err());
}

#[test]
#[ignore = "requires actual MLT and FFmpeg; all production export paths"]
fn animated_layer_reaches_standard_queue_ab_and_srt_none() {
    use autonapisy_core_tests::{
        caption_stream,
        export_studio::{Options, Queue},
        project, rendering,
        smart_export::Sample,
    };
    use std::{
        fs,
        path::Path,
        time::{Duration, Instant},
    };
    let ff = PathBuf::from(std::env::var_os("AUTONAPISY_FFMPEG").unwrap());
    let melt = PathBuf::from(std::env::var_os("ROLVIXA_MLT").unwrap());
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("Mowa Łódź.mp4");
    let o = Command::new(&ff)
        .args([
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=128x224:r=30:d=6",
            "-f",
            "lavfi",
            "-i",
            "sine=f=440:sample_rate=48000:duration=6",
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
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
    let mut v: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/smartcut030.json")).unwrap();
    let p = &mut v["cut"];
    p["schemaVersion"] = 15.into();
    p["name"] = "Animacja produkcyjna Łódź".into();
    p["media"] = serde_json::json!({"path":source.to_str().unwrap(),"name":"Mowa","duration":6});
    p["canvas"] = serde_json::json!({"width":128,"height":224});
    p["assets"] = serde_json::json!([]);
    p["clips"] = serde_json::json!([{"id":"v","start":0,"sourceIn":0,"sourceOut":6,"volume":0.7,"audioRoute":"embedded"}]);
    p["transitions"] = serde_json::json!([]);
    p["tracks"] = serde_json::json!({});
    p["masterAudio"] = serde_json::json!({"gainDb":-3});
    p["segments"] = serde_json::json!([{"id":"a","start":0.4,"end":4.6,"text":"Zażółć gęślą jaźń","styleId":"default","words":[]}]);
    p["timelineSegments"] = serde_json::Value::Null;
    p["captionEdits"] = serde_json::json!({});
    p["styles"]["default"]["animation"] = serde_json::json!({"preset":"karaoke-flow","version":1,"accentColor":"#ffe600","speed":1,"intensity":1});
    let project = project::parse(&p.to_string()).unwrap();
    let pixels = |global_frame: usize| {
        let mut data = vec![0u8; 128 * 224 * 4];
        let color = if global_frame / 15 % 2 == 0 {
            [255, 255, 0, 255]
        } else {
            [0, 255, 0, 255]
        };
        for y in 150..200 {
            for x in 20..110 {
                let i = (y * 128 + x) * 4;
                data[i..i + 4].copy_from_slice(&color);
            }
        }
        data
    };
    let fill = |id: u64, frames: usize, start: f64| {
        let stream = caption_stream::lookup(id).unwrap();
        for i in 0..frames {
            stream
                .push(i, pixels((start * 30.).round() as usize + i))
                .unwrap();
        }
    };
    let pending = Sample::prepare(
        Arc::new(Job::new(40)),
        project.clone(),
        Options::default(),
        ff.clone(),
        melt.clone(),
        1.,
        3.,
    )
    .unwrap();
    let pending_info = pending.entry.animation_info().unwrap();
    let pending_stream = caption_stream::lookup(pending_info.id).unwrap();
    let scratch = pending.entry.dir.path().to_owned();
    drop(pending);
    assert!(
        scratch.exists(),
        "Sample parent deleted an in-flight encoder directory"
    );
    pending_stream.abort();
    drop(pending_stream);
    assert!(!scratch.exists());
    assert!(caption_stream::lookup(pending_info.id).is_err());
    let sample = Sample::prepare(
        Arc::new(Job::new(41)),
        project.clone(),
        Options {
            speed: "fast".into(),
            ..Options::default()
        },
        ff.clone(),
        melt.clone(),
        1.,
        3.,
    )
    .unwrap();
    let a = sample.entry.animation_info().unwrap();
    assert_eq!(a.frames, 90);
    assert_eq!(a.start, 1.);
    fill(a.id, a.frames, a.start);
    let report = sample.run().unwrap();
    assert!(report.measurements.len() >= 2);
    let frame = |file: &Path, t: f64| {
        let out = Command::new(&ff)
            .args(["-v", "error", "-ss", &t.to_string(), "-i"])
            .arg(file)
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
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        out.stdout
    };
    let color = |bytes: &[u8]| {
        let i = (170 * 128 + 50) * 3;
        [bytes[i], bytes[i + 1], bytes[i + 2]]
    };
    for m in &report.measurements {
        let output = sample.path(m.index).unwrap();
        let first = color(&frame(&output, 0.1));
        let second = color(&frame(&output, 0.7));
        assert!(
            first[0] > 200 && first[1] > 200 && first[2] < 30,
            "wrong range origin {first:?}"
        );
        assert!(
            second[0] < 30 && second[1] > 200 && second[2] < 30,
            "animation flattened {second:?}"
        );
    }
    let queue = Arc::new(Queue::default());
    let mut entries = Vec::new();
    for captions in ["burn", "srt", "none"] {
        let e = queue
            .prepare(
                project.clone(),
                Options {
                    captions: captions.into(),
                    speed: "fast".into(),
                    ..Options::default()
                },
                root.path(),
                ff.clone(),
                melt.clone(),
            )
            .unwrap();
        if let Some(a) = e.start_animation(0., e.meta.duration).unwrap() {
            fill(a.id, a.frames, a.start);
        }
        queue.ready(e.id).unwrap();
        entries.push(e);
    }
    let at = Instant::now();
    while queue
        .list()
        .iter()
        .any(|i| !["completed", "failed", "cancelled"].contains(&i.state.as_str()))
    {
        assert!(at.elapsed() < Duration::from_secs(90));
        std::thread::sleep(Duration::from_millis(20));
    }
    for i in queue.list() {
        assert_eq!(i.state, "completed", "{}", i.message);
    }
    let burn = &entries[0];
    let yellow = color(&frame(&burn.target, 0.1));
    let green = color(&frame(&burn.target, 0.7));
    assert!(yellow[0] > 200 && green[0] < 30 && green[1] > 200);
    assert!(
        !burn.dir.path().join("animated-layer.mkv").exists(),
        "Completed queue retains huge alpha scratch file"
    );
    for e in &entries[1..] {
        assert!(e.animation_info().is_none());
        let c = color(&frame(&e.target, 0.7));
        assert!(
            c[2] > 200 && c[1] < 30,
            "SRT/none burned an animation {c:?}"
        );
    }
    let text = fs::read_to_string(entries[1].target.with_extension("srt")).unwrap();
    assert!(text.contains("Zażółć gęślą jaźń"));
    assert!(!entries[2].target.with_extension("srt").exists());
    let dir = Arc::new(tempfile::tempdir_in(root.path()).unwrap());
    let job = Arc::new(Job::new(42));
    let (stream, info) =
        caption_stream::export_stream(job.clone(), &ff, dir.clone(), 128, 224, 0., 6.).unwrap();
    fill(info.id, info.frames, 0.);
    stream.finish().unwrap();
    let meta = rendering::Metadata {
        width: 128,
        height: 224,
        duration: 6.,
        has_audio: true,
    };
    let legacy = root.path().join("Zwykły eksport Łódź.mp4");
    rendering::render_mlt_with_layer(
        &melt,
        &job,
        &ff,
        &source,
        &legacy,
        &None,
        dir.path(),
        &project,
        &meta,
        Some(&stream.output),
    )
    .unwrap();
    assert!(color(&frame(&legacy, 0.1))[0] > 200);
    assert!(color(&frame(&legacy, 0.7))[0] < 30);
    assert!(
        !dir.path().join("timeline.ffconcat").exists(),
        "Animation must not generate PNG-per-frame intermediates"
    );
    let mut off_project=project.clone();
    off_project.name="Wyłączona animacja Łódź".into();
    off_project.styles.get_mut("default").unwrap().animation.as_mut().unwrap().enabled=Some(false);
    let off=queue.prepare(off_project,Options{speed:"fast".into(),..Options::default()},root.path(),ff.clone(),melt.clone()).unwrap();
    assert!(!off.needs_animation());
    assert!(off.start_animation(0.,off.meta.duration).unwrap().is_none());
    let mut bitmap=Vec::new();
    {let mut encoder=png::Encoder::new(&mut bitmap,128,224);encoder.set_color(png::ColorType::Rgba);encoder.set_depth(png::BitDepth::Eight);encoder.write_header().unwrap().write_image_data(&pixels(0)).unwrap();}
    for i in 0..off.project.segments.len(){off.upload(i,&bitmap).unwrap();}
    queue.ready(off.id).unwrap();let at=Instant::now();
    while off.item().state!="completed" {assert_ne!(off.item().state,"failed","{}",off.item().message);assert!(at.elapsed()<Duration::from_secs(60));std::thread::sleep(Duration::from_millis(20));}
    assert!(off.animation_info().is_none());
    for t in [0.7,1.7]{let c=color(&frame(&off.target,t));assert!(c[0]>200&&c[1]>200&&c[2]<30,"Motion Off lost the unchanged bitmap: {c:?}");}
    assert_eq!(off.project.styles["default"].animation.as_ref().unwrap().preset,"karaoke-flow");
    queue.shutdown();
    println!("0.34a motion Off: no alpha stream, retained preset and real static PNG/MP4 pixels across word times: OK");
    println!("0.33c standard MP4, serialized queue burn/SRT/none and A/B nonzero range: real dynamic pixels, unchanged Polish SRT, no static flattening, scratch cleanup: OK");
}

#[test]
#[ignore = "requires real FFmpeg; cancel a producer while the bounded channel is occupied"]
fn cancel_reaps_a_stream_with_a_concurrent_binary_producer() {
    use autonapisy_core_tests::caption_stream::{export_stream, lookup};
    use std::sync::atomic::{AtomicUsize, Ordering};
    let ff = PathBuf::from(std::env::var_os("AUTONAPISY_FFMPEG").unwrap());
    let dir = Arc::new(tempfile::tempdir().unwrap());
    let path = dir.path().to_owned();
    let job = Arc::new(Job::new(35));
    let (stream, info) = export_stream(job, &ff, dir.clone(), 1920, 1080, 0., 300.).unwrap();
    let done = Arc::new(AtomicUsize::new(0));
    let sent = done.clone();
    let producer = stream.clone();
    let handle = std::thread::spawn(move || {
        for i in 0..info.frames {
            match producer.push(i, vec![100; 1920 * 1080 * 4]) {
                Ok(()) => {
                    sent.fetch_add(1, Ordering::SeqCst);
                }
                Err(_) => return,
            }
        }
        panic!("Producer unexpectedly completed before cancellation");
    });
    let wait = std::time::Instant::now();
    while done.load(Ordering::SeqCst) < 2 {
        assert!(wait.elapsed().as_secs() < 10);
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    let at = std::time::Instant::now();
    stream.abort();
    handle.join().unwrap();
    assert!(
        at.elapsed().as_secs() < 3,
        "Cancel did not unblock/reap a pending producer"
    );
    assert!(!stream.output.exists());
    drop(stream);
    drop(dir);
    assert!(!path.exists());
    assert!(lookup(info.id).is_err());
    println!("0.33c full-HD producer blocked by backpressure: cancel/unblock/reap/directory and token cleanup: OK");
}
