use autonapisy_core_tests::{mlt, project, proxy, rendering, transcription::Job};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
};
fn run(ff: &Path, args: &[&str], target: &Path) {
    let r = Command::new(ff).args(args).arg(target).output().unwrap();
    assert!(r.status.success(), "{}", String::from_utf8_lossy(&r.stderr));
}
fn pixels(ff: &Path, path: &Path, time: &str) -> Vec<u8> {
    let r = Command::new(ff)
        .args(["-v", "error", "-ss", time, "-i"])
        .arg(path)
        .args([
            "-frames:v",
            "1",
            "-vf",
            "scale=16:16",
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "pipe:1",
        ])
        .output()
        .unwrap();
    assert!(r.status.success(), "{}", String::from_utf8_lossy(&r.stderr));
    assert_eq!(r.stdout.len(), 16 * 16 * 3);
    r.stdout
}
fn onset(ff: &Path, path: &Path, dir: &Path, label: &str) -> f64 {
    let wav = dir.join(format!("{label}.wav"));
    let r = Command::new(ff)
        .args(["-v", "error", "-y", "-i"])
        .arg(path)
        .args(["-vn", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le"])
        .arg(&wav)
        .output()
        .unwrap();
    assert!(r.status.success());
    let mut reader = hound::WavReader::open(wav).unwrap();
    reader
        .samples::<i16>()
        .position(|s| s.unwrap().abs() > 300)
        .unwrap() as f64
        / 48000.
}
#[test]
#[ignore = "requires AUTONAPISY_FFMPEG"]
fn real_hevc_webm_vfr_and_4k_without_audio() {
    let ff = PathBuf::from(std::env::var("AUTONAPISY_FFMPEG").unwrap());
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("cache");
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures");
    let vfr = dir.path().join("Zmienny FPS.mp4");
    run(
        &ff,
        &[
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=256x144:r=30:d=3",
            "-vf",
            "select=if(lt(t\\,1)\\,1\\,not(mod(n\\,3)))",
            "-fps_mode",
            "vfr",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
        ],
        &vfr,
    );
    let uhd = dir.path().join("4K 60 FPS.mp4");
    run(
        &ff,
        &[
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=red:s=3840x2160:r=60:d=0.5",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-threads",
            "2",
            "-pix_fmt",
            "yuv420p",
        ],
        &uhd,
    );
    for source in [
        fixtures.join("synthetic-hevc.mov"),
        fixtures.join("synthetic-vp9.webm"),
        vfr,
        uhd,
    ] {
        let job = Arc::new(Job::new(20));
        let info = proxy::inspect(&job, &ff, &source, dir.path()).unwrap();
        let stamp = proxy::stamp(&source).unwrap();
        let before = fs::read(&source).unwrap();
        let result =
            proxy::generate(&job, &ff, &root, &stamp, &info, 540, 64 * 1024 * 1024).unwrap();
        let meta = rendering::inspect(
            &Arc::new(Job::new(21)),
            &ff,
            Path::new(&result.output.path),
            dir.path(),
        )
        .unwrap();
        assert!(!meta.has_audio);
        assert!(meta.width.max(meta.height) <= 540);
        assert!((meta.duration - info.duration).abs() < 0.15);
        let times = if info.possible_vfr && info.duration > 2.5 {
            vec!["0.2", "1.6", "2.3"]
        } else {
            vec!["0.2"]
        };
        for time in times {
            let a = pixels(&ff, &source, time);
            let b = pixels(&ff, Path::new(&result.output.path), time);
            let difference = a
                .iter()
                .zip(b)
                .map(|(a, b)| (*a as f64 - b as f64).abs())
                .sum::<f64>()
                / a.len() as f64;
            assert!(difference < 18., "frame mapping {time}: {difference}");
        }
        assert_eq!(before, fs::read(&source).unwrap());
        println!(
            "Real proxy {}: {} {}x{} => {}x{}, no audio, duration preserved",
            source.file_name().unwrap().to_string_lossy(),
            info.codec,
            info.width,
            info.height,
            meta.width,
            meta.height
        );
    }
}
#[test]
#[ignore = "requires AUTONAPISY_FFMPEG and ROLVIXA_MLT"]
fn real_rotated_60fps_proxy_cache_sync_and_original_export() {
    let ff = PathBuf::from(std::env::var("AUTONAPISY_FFMPEG").unwrap());
    let melt = fs::canonicalize(std::env::var("ROLVIXA_MLT").unwrap()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join("base.mov");
    run(
        &ff,
        &[
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=640x360:r=60:d=3",
            "-f",
            "lavfi",
            "-i",
            "aevalsrc=0.3*sin(2*PI*440*t)*between(t\\,0.6\\,1.1):s=48000:d=3",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
        ],
        &base,
    );
    let source = dir.path().join("Telefon Łódź obrót.mov");
    let r = Command::new(&ff)
        .args(["-v", "error", "-y", "-display_rotation:v:0", "90", "-i"])
        .arg(&base)
        .args(["-c", "copy"])
        .arg(&source)
        .output()
        .unwrap();
    assert!(r.status.success());
    let original = fs::read(&source).unwrap();
    let job = Arc::new(Job::new(1));
    let info = proxy::inspect(&job, &ff, &source, dir.path()).unwrap();
    assert!(info.recommended());
    assert_eq!((info.width, info.height), (360, 640));
    assert!(info.fps.unwrap() > 59.);
    let stamp = proxy::stamp(&source).unwrap();
    let root = dir.path().join("Pamięć proxy");
    let result = proxy::generate(&job, &ff, &root, &stamp, &info, 540, 64 * 1024 * 1024).unwrap();
    let output = Path::new(&result.output.path);
    assert!(proxy::cached(&root, &stamp, 540).is_some());
    assert!(proxy::cached(&root, &stamp, 720).is_none());
    assert_eq!((result.info.width, result.info.height), (360, 640));
    let meta = rendering::inspect(&Arc::new(Job::new(2)), &ff, output, dir.path()).unwrap();
    assert_eq!((meta.width, meta.height), (304, 540));
    assert!((meta.duration - info.duration).abs() < 0.1);
    for time in ["0.4", "1.3", "2.4"] {
        let a = pixels(&ff, &source, time);
        let b = pixels(&ff, output, time);
        let difference = a
            .iter()
            .zip(b)
            .map(|(a, b)| (*a as f64 - b as f64).abs())
            .sum::<f64>()
            / a.len() as f64;
        assert!(difference < 18., "frame mapping at {time}: {difference}");
    }
    let original_onset = onset(&ff, &source, dir.path(), "original");
    let proxy_onset = onset(&ff, output, dir.path(), "proxy");
    assert!(
        (original_onset - proxy_onset).abs() < 0.04,
        "Audio shifted: {original_onset}, {proxy_onset}"
    );
    let p=project::parse(&serde_json::json!({"schemaVersion":8,"name":"Proxy","media":{"path":source,"name":"Telefon","duration":3},"clips":[{"id":"cut","start":0,"sourceIn":0.5,"sourceOut":2.5}],"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-17T00:00:00Z","updatedAt":"2026-10-17T00:00:00Z"}).to_string()).unwrap();
    let saved = serde_json::to_string(&p).unwrap();
    let mut map = HashMap::new();
    map.insert(
        fs::canonicalize(&source)
            .unwrap()
            .to_str()
            .unwrap()
            .to_owned(),
        result.output.path.clone(),
    );
    let preview = proxy::substitute(&p, &map);
    assert_eq!(preview.clips.as_ref().unwrap()[0].source_in, 0.5);
    assert_ne!(
        preview.media.as_ref().unwrap().path,
        p.media.as_ref().unwrap().path
    );
    assert_eq!(serde_json::to_string(&p).unwrap(), saved);
    let preview_dir = dir.path().join("preview");
    fs::create_dir(&preview_dir).unwrap();
    let original_meta =
        rendering::inspect(&Arc::new(Job::new(3)), &ff, &source, dir.path()).unwrap();
    mlt::prepare(
        &Arc::new(Job::new(3)),
        &ff,
        &preview,
        &meta,
        &preview_dir,
        true,
    )
    .unwrap();
    mlt::run(
        &Arc::new(Job::new(3)),
        &melt,
        &preview_dir,
        0,
        59,
        true,
        false,
    )
    .unwrap();
    assert!(fs::read_to_string(preview_dir.join("timeline.mlt"))
        .unwrap()
        .contains("video.mp4"));
    fs::remove_file(output).unwrap();
    assert!(proxy::cached(&root, &stamp, 540).is_none());
    let export_dir = dir.path().join("export");
    fs::create_dir(&export_dir).unwrap();
    let exported = mlt::assemble(
        &Arc::new(Job::new(4)),
        &melt,
        &ff,
        &p,
        &original_meta,
        &export_dir,
    )
    .unwrap();
    let export_meta =
        rendering::inspect(&Arc::new(Job::new(4)), &ff, &exported, &export_dir).unwrap();
    assert_eq!((export_meta.width, export_meta.height), (360, 640));
    assert!((export_meta.duration - 2.).abs() < 0.1);
    assert!(!fs::read_to_string(export_dir.join("timeline.mlt"))
        .unwrap()
        .contains("video.mp4"));
    assert_eq!(fs::read(&source).unwrap(), original);
    let canceled = Arc::new(Job::new(5));
    canceled.cancel();
    assert!(proxy::generate(&canceled, &ff, &root, &stamp, &info, 720, 64 * 1024 * 1024).is_err());
    assert!(proxy::generate(&Arc::new(Job::new(6)), &ff, &root, &stamp, &info, 720, 100).is_err());
    fs::write(&source, b"zmienione nagranie").unwrap();
    assert!(!proxy::unchanged(&stamp));
    println!("Real rotated 60 FPS proxy, persistent cache, frame/audio mapping, trim, MLT preview and original-resolution export after removing proxy: OK");
}
