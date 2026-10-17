use autonapisy_core_tests::{
    audio_envelope, mlt, project, rendering, timeline_audio, transcription::Job,
};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};
fn rms(path: &Path, time: f64) -> f64 {
    let mut r = hound::WavReader::open(path).unwrap();
    let spec = r.spec();
    let skip = ((time - 0.04) * spec.sample_rate as f64).max(0.) as usize * spec.channels as usize;
    let take = (0.08 * spec.sample_rate as f64) as usize * spec.channels as usize;
    let v: Vec<_> = r
        .samples::<i16>()
        .skip(skip)
        .take(take)
        .map(|s| s.unwrap() as f64)
        .collect();
    (v.iter().map(|x| x * x).sum::<f64>() / v.len() as f64).sqrt()
}
#[test]
#[ignore = "requires ROLVIXA_MLT and AUTONAPISY_FFMPEG"]
fn real_source_time_fades_points_seek_split_and_transcription() {
    let melt = fs::canonicalize(std::env::var("ROLVIXA_MLT").unwrap()).unwrap();
    let ff = PathBuf::from(std::env::var("AUTONAPISY_FFMPEG").unwrap());
    let d = tempfile::tempdir().unwrap();
    let source = d.path().join("Dźwięk Łódź.wav");
    let mut w = hound::WavWriter::create(
        &source,
        hound::WavSpec {
            channels: 1,
            sample_rate: 48000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .unwrap();
    for i in 0..48000 * 7 {
        w.write_sample((4000. * (i as f64 * std::f64::consts::TAU * 1000. / 48000.).sin()) as i16)
            .unwrap();
    }
    w.finalize().unwrap();
    let p=project::parse(&serde_json::json!({"schemaVersion":9,"name":"Audio","media":null,"assets":[{"id":"a","name":"Dźwięk","path":source,"kind":"audio","duration":7,"segments":[]}],"clips":[{"id":"c","assetId":"a","kind":"audio","start":0.5,"sourceIn":1,"sourceOut":6,"volume":0.8,"audio":{"fadeIn":{"anchor":1,"duration":2},"fadeOut":{"anchor":6,"duration":2},"points":[{"id":"p1","time":1,"gain":1},{"id":"p2","time":3.5,"gain":0.4},{"id":"p3","time":6,"gain":0.8}]}}],"styles":{"default":{"fontFamily":"Arial","fontSize":40,"color":"#ffffff","background":"#000000","position":"bottom"}},"segments":[],"createdAt":"2026-10-17T00:00:00Z","updatedAt":"2026-10-17T00:00:00Z"}).to_string()).unwrap();
    let job = Arc::new(Job::new(1));
    let meta = rendering::Metadata {
        width: 64,
        height: 64,
        duration: 5.5,
        has_audio: true,
    };
    let render = |label: &str, p: &project::Project, from: i64| {
        let folder = d.path().join(label);
        fs::create_dir(&folder).unwrap();
        fs::write(
            folder.join("timeline.mlt"),
            mlt::xml(p, &meta, &[], None).unwrap(),
        )
        .unwrap();
        mlt::run(&job, &melt, &folder, from, 164, false, true).unwrap()
    };
    let mut neutral = p.clone();
    neutral.clips.as_mut().unwrap()[0].volume = 1.;
    neutral.clips.as_mut().unwrap()[0].audio = None;
    let baseline = render("base", &neutral, 0);
    let actual = render("full", &p, 0);
    let seek = render("seek", &p, 30);
    let folder = d.path().join("ffmpeg");
    fs::create_dir(&folder).unwrap();
    let ranges = timeline_audio::prepare(&job, &ff, &p, &folder).unwrap();
    assert!((ranges[0].timeline_start - 0.5).abs() < 1e-6);

    let decode = |input: &Path, label: &str| {
        let out = d.path().join(format!("{label}.wav"));
        let result = std::process::Command::new(&ff)
            .args(["-v", "error", "-y", "-i"])
            .arg(input)
            .args(["-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le"])
            .arg(&out)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        out
    };
    let export_dir = d.path().join("export");
    fs::create_dir(&export_dir).unwrap();
    let mp4 = mlt::assemble(&job, &melt, &ff, &p, &meta, &export_dir).unwrap();
    let exported = decode(&mp4, "mp4");
    let ff_dir = d.path().join("ff-export");
    fs::create_dir(&ff_dir).unwrap();
    let ff_mp4 =
        autonapisy_core_tests::montage::assemble(&job, &ff, &source, &ff_dir, &p, &meta).unwrap();
    let ff_exported = decode(&ff_mp4, "ff-mp4");

    let base_export_dir = d.path().join("base-export");
    fs::create_dir(&base_export_dir).unwrap();
    let base_mp4 = mlt::assemble(&job, &melt, &ff, &neutral, &meta, &base_export_dir).unwrap();
    let mp4_base = decode(&base_mp4, "mp4-base");
    let base_ff_dir = d.path().join("base-ff-export");
    fs::create_dir(&base_ff_dir).unwrap();
    let base_ff =
        autonapisy_core_tests::montage::assemble(&job, &ff, &source, &base_ff_dir, &neutral, &meta)
            .unwrap();
    let ff_mp4_base = decode(&base_ff, "ff-mp4-base");
    let transcript_dir = d.path().join("mlt-transcript");
    fs::create_dir(&transcript_dir).unwrap();
    fs::write(
        transcript_dir.join("timeline.mlt"),
        mlt::xml(&p, &meta, &[], Some(&[(15, 165)])).unwrap(),
    )
    .unwrap();
    let transcript = mlt::run(&job, &melt, &transcript_dir, 0, 149, false, true).unwrap();
    let mut split = p.clone();
    let c = split.clips.as_mut().unwrap()[0].clone();
    let mut left = c.clone();
    left.source_out = 2.4;
    let mut right = c.clone();
    right.id = "right".into();
    right.source_in = 2.4;
    right.start = 1.9;
    split.clips = Some(vec![left, right]);
    let cut = render("split", &split, 0);
    for time in [0.8, 1.2, 1.7, 2.3, 3.0, 3.8, 4.8, 5.2] {
        let source_time = 1. + time - 0.5;
        let expected = audio_envelope::gain(&c, source_time);
        let base = rms(&baseline, time);
        let got = rms(&actual, time) / base;
        assert!(
            (got - expected).abs() < 0.035,
            "MLT at {time}: {got} != {expected}"
        );
        for (label, file, reference, offset) in [
            ("MP4", &exported, &mp4_base, 0.),
            ("FFmpeg MP4", &ff_exported, &ff_mp4_base, 0.),
            ("MLT transcript", &transcript, &baseline, 0.5),
        ] {
            let ratio = rms(file, time - offset) / rms(reference, time);
            assert!(
                (ratio - expected).abs() < 0.04,
                "{label} at {time}: {ratio} != {expected}"
            );
        }
        let ff_ratio = rms(&folder.join("audio.wav"), time - 0.5) / base;
        assert!(
            (ff_ratio - expected).abs() < 0.035,
            "FFmpeg at {time}: {ff_ratio} != {expected}"
        );
        assert!(
            (rms(&cut, time) / base - got).abs() < 0.035,
            "Split at {time}"
        );
        if time > 1.1 {
            assert!(
                (rms(&seek, time - 1.) / base - got).abs() < 0.035,
                "Seek at {time}"
            );
        }
    }
}

#[test]
#[ignore = "requires ROLVIXA_MLT and AUTONAPISY_FFMPEG"]
fn actual_linked_audio_mix_overlapping_fades_and_mute() {
    let ff = PathBuf::from(std::env::var("AUTONAPISY_FFMPEG").unwrap());
    let melt = fs::canonicalize(std::env::var("ROLVIXA_MLT").unwrap()).unwrap();
    let d = tempfile::tempdir().unwrap();
    let source = d.path().join("Film z dźwiękiem Łódź.mp4");
    let result = std::process::Command::new(&ff)
        .args([
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=red:s=128x128:r=30:d=4",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=1000:sample_rate=48000:duration=4",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
        ])
        .arg(&source)
        .output()
        .unwrap();
    assert!(result.status.success());
    let mut p=project::parse(&serde_json::json!({"schemaVersion":9,"name":"Mix","media":{"path":source,"name":"Film","duration":4},"assets":[],"clips":[{"id":"v","kind":"video","start":0,"sourceIn":0,"sourceOut":4,"volume":0.5,"audio":{"fadeIn":{"anchor":0,"duration":4},"fadeOut":{"anchor":4,"duration":4},"points":[]}}],"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":40,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-17T00:00:00Z","updatedAt":"2026-10-17T00:00:00Z"}).to_string()).unwrap();
    let mut audio = p.clips.as_ref().unwrap()[0].clone();
    audio.id = "a".into();
    audio.kind = "audio".into();
    audio.track = 1;
    p.clips.as_mut().unwrap().push(audio);
    let job = Arc::new(Job::new(1));
    let meta = rendering::Metadata {
        width: 128,
        height: 128,
        duration: 4.,
        has_audio: true,
    };
    let render = |name: &str, p: &project::Project| {
        let dir = d.path().join(name);
        fs::create_dir(&dir).unwrap();
        fs::write(
            dir.join("timeline.mlt"),
            mlt::xml(p, &meta, &[], None).unwrap(),
        )
        .unwrap();
        mlt::run(&job, &melt, &dir, 0, 119, false, true).unwrap()
    };
    let both = render("both", &p);
    p.tracks.a2.muted = true;
    let one = render("one", &p);
    p.tracks.a1.muted = true;
    let muted = render("muted", &p);
    for t in [0.5, 1., 2., 3., 3.5] {
        assert!((rms(&both, t) / rms(&one, t) - 2.).abs() < 0.02);
        assert!(rms(&muted, t) < 1.);
    }
    assert!(timeline_audio::plan(&job, &ff, &p, d.path()).is_err());
}
