use autonapisy_core_tests::{mlt, montage, project, quality, rendering, transcription::Job};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
    time::Duration,
};
fn ff(ff: &Path, args: &[&str]) {
    let out = Command::new(ff).args(args).output().unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
}
#[test]
#[ignore = "requires real MLT and FFmpeg"]
fn composed_lufs_peak_silence_black_and_normalization() {
    let ffmpeg = PathBuf::from(std::env::var("AUTONAPISY_FFMPEG").unwrap());
    let melt = fs::canonicalize(std::env::var("ROLVIXA_MLT").unwrap()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let video = dir.path().join("Film źródłowy Łódź 日本.mp4");
    let audio = dir.path().join("Muzyka łąka.wav");
    ff(
        &ffmpeg,
        &[
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=red:s=160x90:r=30:d=1",
            "-f",
            "lavfi",
            "-i",
            "color=black:s=160x90:r=30:d=1",
            "-f",
            "lavfi",
            "-i",
            "color=white:s=160x90:r=30:d=4",
            "-filter_complex",
            "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
            "-map",
            "[v]",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            video.to_str().unwrap(),
        ],
    );
    ff(&ffmpeg,&["-v","error","-y","-f","lavfi","-i","aevalsrc=if(lt(t\\,2)\\,0.9*sin(2*PI*660*t)\\,if(lt(t\\,3)\\,0\\,0.08*sin(2*PI*660*t))):d=6:s=48000","-ac","2","-c:a","pcm_f32le",audio.to_str().unwrap()]);
    let p=project::parse(&serde_json::json!({"schemaVersion":11,"name":"Pomiary rzeczywiste","media":{"path":video,"name":"Film","duration":6},"assets":[{"id":"sound","path":audio,"name":"Audio","kind":"audio","duration":6,"segments":[]}],"clips":[{"id":"picture","start":0,"sourceIn":0,"sourceOut":6},{"id":"sound1","assetId":"sound","kind":"audio","start":0,"sourceIn":0,"sourceOut":6,"track":0},{"id":"sound2","assetId":"sound","kind":"audio","start":0,"sourceIn":0,"sourceOut":6,"track":1}],"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":40,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-18T00:00:00Z","updatedAt":"2026-10-18T00:00:00Z"}).to_string()).unwrap();
    let old_video = fs::read(&video).unwrap();
    let old_audio = fs::read(&audio).unwrap();
    let job = Arc::new(Job::new(1));
    let input_key = quality::fingerprint(&p, &ffmpeg, &melt).unwrap();
    let work = dir.path().join("raw");
    fs::create_dir(&work).unwrap();
    let r = quality::analyze(&job, &melt, &ffmpeg, &p, &work, "test".into()).unwrap();
    println!(
        "raw {:?}; silence {:?}; black {:?}; peaks {:?}",
        r.raw, r.silence, r.black, r.peaks
    );
    assert!(r.raw.integrated_lufs.is_some());
    assert!(
        r.raw.true_peak_db.unwrap() > 0.1,
        "Float mix must retain clipping BEFORE AAC"
    );
    assert!(!r.peaks.is_empty());
    assert!(r
        .silence
        .iter()
        .any(|s| (s.start - 2.).abs() < 0.12 && (s.end - 3.).abs() < 0.12));
    assert!(r
        .black
        .iter()
        .any(|s| (s.start - 1.).abs() < 0.04 && (s.end - 2.).abs() < 0.08));
    let plan = quality::normalization(&r.raw, -14.).unwrap();
    let mut normalized = p.clone();
    normalized.master_audio.gain_db = plan.gain_db;
    let meta = rendering::inspect(&job, &ffmpeg, &video, dir.path()).unwrap();
    for native in [true, false] {
        let target = dir.path().join(format!("render-{native}"));
        fs::create_dir(&target).unwrap();
        let output = if native {
            mlt::assemble(&job, &melt, &ffmpeg, &normalized, &meta, &target).unwrap()
        } else {
            montage::assemble(&job, &ffmpeg, &video, &target, &normalized, &meta).unwrap()
        };
        let measured = quality::measure(&job, &ffmpeg, &output, &target, 6., 0.).unwrap();
        println!("normalized {native}: {:?}", measured.0);
        assert!((measured.0.integrated_lufs.unwrap() - plan.predicted_lufs).abs() < 0.4);
        assert!(measured.0.true_peak_db.unwrap() < -0.8);
        assert!(measured.4.is_empty());
    }
    let mut changed = p.clone();
    changed.name = "Inna nazwa".into();
    changed.tracks.v1.locked = true;
    changed.tracks.v1.ripple = "off".into();
    assert_eq!(
        input_key,
        quality::fingerprint(&changed, &ffmpeg, &melt).unwrap()
    );
    changed.master_audio.gain_db = -3.;
    assert_ne!(
        input_key,
        quality::fingerprint(&changed, &ffmpeg, &melt).unwrap()
    );
    assert_eq!(fs::read(&video).unwrap(), old_video);
    assert_eq!(fs::read(&audio).unwrap(), old_audio);
    let mut silent = p.clone();
    silent.clips.as_mut().unwrap().retain(|c| c.kind != "audio");
    let silent_dir = dir.path().join("silent");
    fs::create_dir(&silent_dir).unwrap();
    let silence = quality::analyze(
        &Arc::new(Job::new(4)),
        &melt,
        &ffmpeg,
        &silent,
        &silent_dir,
        "silent".into(),
    )
    .unwrap();
    assert!(silence.raw.integrated_lufs.is_none());
    assert!(quality::normalization(&silence.raw, -14.).is_err());
    assert!(silence.silence.iter().any(|s| s.start < 0.1 && s.end > 5.9));
    let mut portrait = p.clone();
    portrait.canvas = Some(project::Canvas {
        width: 1080,
        height: 1920,
    });
    let limited = dir.path().join("limited");
    fs::create_dir(&limited).unwrap();
    assert!(quality::render_analysis(
        &Arc::new(Job::new(5)),
        &melt,
        &ffmpeg,
        &portrait,
        &limited,
        1
    )
    .unwrap_err()
    .contains("limit"));
    let xml = fs::read_to_string(limited.join("timeline.mlt")).unwrap();
    assert!(xml.contains("width=\"180\" height=\"320\""));
    let cancel = Arc::new(Job::new(2));
    cancel.cancel();
    let target = dir.path().join("cancel");
    fs::create_dir(&target).unwrap();
    assert!(quality::analyze(&cancel, &melt, &ffmpeg, &p, &target, "cancel".into()).is_err());
    let mut longer = p.clone();
    longer.clips = Some(
        (0..40)
            .map(|i| {
                let mut c = p.clips.as_ref().unwrap()[0].clone();
                c.id = format!("long-{i}");
                c.start = i as f64 * 6.;
                c
            })
            .collect(),
    );
    let running = Arc::new(Job::new(3));
    let kill = running.clone();
    let t = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        kill.cancel();
    });
    let target = dir.path().join("cancel-running");
    fs::create_dir(&target).unwrap();
    let start = std::time::Instant::now();
    assert!(quality::analyze(&running, &melt, &ffmpeg, &longer, &target, "cancel".into()).is_err());
    t.join().unwrap();
    assert!(start.elapsed() < Duration::from_secs(10));
}
