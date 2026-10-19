//! The exact TypeScript planner output is rendered by the two production engines.
use autonapisy_core_tests::{
    audio_envelope, mlt, montage, project, rendering, smart_cut, transcription::Job,
};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
};
fn run(ff: &Path, args: &[&str], out: &Path) {
    let o = Command::new(ff).args(args).arg(out).output().unwrap();
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
}
fn fixture(name: &str, voice: &Path, music: &Path) -> project::Project {
    let mut v: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/smartcut028.json")).unwrap();
    v[name]["media"]["path"] = voice.to_string_lossy().as_ref().into();
    v[name]["assets"][0]["path"] = music.to_string_lossy().as_ref().into();
    project::parse(&v[name].to_string()).unwrap()
}
fn tones(ff: &Path, file: &Path, time: f64, length: f64) -> [f64; 3] {
    let o = Command::new(ff)
        .args(["-v", "error", "-i"])
        .arg(file)
        .args(["-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"])
        .output()
        .unwrap();
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
    let samples: Vec<_> = o
        .stdout
        .chunks_exact(4)
        .skip((time * 48000.).round() as usize)
        .take((length * 48000.).round() as usize)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()) as f64)
        .collect();
    assert!(samples.len() >= (length * 48000.) as usize - 2);
    [300., 600., 900.].map(|hz| {
        let (mut a, mut b) = (0., 0.);
        for (i, x) in samples.iter().enumerate() {
            let ph = std::f64::consts::TAU * hz * i as f64 / 48000.;
            a += x * ph.cos();
            b += x * ph.sin();
        }
        (a * a + b * b).sqrt() / samples.len() as f64
    })
}
fn tools() -> (PathBuf, PathBuf) {
    (
        PathBuf::from(std::env::var_os("AUTONAPISY_FFMPEG").unwrap()),
        fs::canonicalize(std::env::var_os("ROLVIXA_MLT").unwrap()).unwrap(),
    )
}
#[test]
#[ignore = "requires real MLT and FFmpeg"]
fn shared_smartcut_plans_keep_hard_picture_cut_crossfade_words_and_independent_music() {
    let (ff, melt) = tools();
    let d = tempfile::tempdir().unwrap();
    let voice = d.path().join("Głos Łódź.mp4");
    let music = d.path().join("Muzyka Łódź.wav");
    run(
        &ff,
        &[
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=red:s=320x180:r=30:d=8,drawbox=color=blue:t=fill:enable='gte(t,3)'",
            "-f",
            "lavfi",
            "-i",
            "aevalsrc=0.125*sin(2*PI*if(lt(t\\,3)\\,300\\,600)*t):s=48000:d=8",
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
    run(
        &ff,
        &[
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=900:sample_rate=48000:duration=8",
            "-c:a",
            "pcm_s16le",
        ],
        &music,
    );
    let job = Arc::new(Job::new(1));
    for name in ["exact", "smooth", "window"] {
        let p = fixture(name, &voice, &music);
        let duration = project::composition_duration(&p);
        let meta = rendering::Metadata {
            width: 320,
            height: 180,
            duration,
            has_audio: true,
        };
        let dir = d.path().join(name);
        fs::create_dir(&dir).unwrap();
        for engine in ["mlt", "ffmpeg"] {
            let folder = dir.join(engine);
            fs::create_dir(&folder).unwrap();
            let file = if engine == "mlt" {
                mlt::assemble(&job, &melt, &ff, &p, &meta, &folder).unwrap()
            } else {
                montage::assemble(&job, &ff, &voice, &folder, &p, &meta).unwrap()
            };
            for time in [0.6, 1.8, 2.04, 2.2, 3.5, 5.5, 6.8] {
                if time + 0.02 > duration {
                    continue;
                }
                let actual = tones(&ff, &file, time, 0.02);
                let mut expected = [0.; 3];
                // Integrate the source-clock envelope over the same real PCM measurement window.
                for i in 0..960 {
                    let t = time + (i as f64 + 0.5) / 48000.;
                    for c in p.clips.as_ref().unwrap() {
                        if c.audio_detached || t < c.start || t >= c.end() {
                            continue;
                        }
                        let source = c.source_in + t - c.start;
                        let tone = if c.asset_id.as_deref() == Some("music028") {
                            2
                        } else if source < 3. {
                            0
                        } else {
                            1
                        };
                        expected[tone] += 0.0625 * audio_envelope::gain(c, source) / 960.;
                    }
                }
                // Native MLT gain is quantized to 30 FPS; AAC fallback also has codec-frame latency.
                // Check its one-frame edge tolerance separately, while requiring both actual tones.
                if name != "exact" && (time - 2.04_f64).abs() < 0.001 {
                    assert!(
                        actual[0] > 0.003 && actual[1] > 0.01,
                        "no real overlap: {actual:?}"
                    );
                }
                for i in 0..3 {
                    let tolerance = if i < 2 && name != "exact" && (time - 2.04_f64).abs() < 0.001 {
                        0.011
                    } else {
                        0.004
                    };
                    assert!(
                        (actual[i] - expected[i]).abs() < tolerance,
                        "{name}/{engine} {time}: {actual:?} != {expected:?}"
                    );
                }
            }
            for (time, channel) in [(1.8, 0), (2.2, 2)] {
                let o = Command::new(&ff)
                    .args(["-v", "error", "-ss", &time.to_string(), "-i"])
                    .arg(&file)
                    .args([
                        "-frames:v",
                        "1",
                        "-vf",
                        "scale=1:1",
                        "-pix_fmt",
                        "rgb24",
                        "-f",
                        "rawvideo",
                        "pipe:1",
                    ])
                    .output()
                    .unwrap();
                assert!(o.status.success());
                assert!(
                    o.stdout[channel] > 150,
                    "hard picture cut {name}/{engine}: {:?}",
                    o.stdout
                );
            }
        }
        let words: Vec<_> = p
            .timeline_segments
            .as_ref()
            .unwrap()
            .iter()
            .flat_map(|s| s.words.iter())
            .collect();
        assert!(words.iter().all(|w| w.text != "usuń" && w.text != "to"));
        assert!(words
            .iter()
            .any(|w| w.text == "dalsza" && (w.start - 2.6).abs() < 1e-6));
    }
}
#[test]
#[ignore = "requires real FFmpeg"]
fn bounded_real_pause_measurements_cancel_and_source_fingerprint() {
    let (ff, _) = tools();
    let d = tempfile::tempdir().unwrap();
    let voice = d.path().join("Pauzy Łódź.mp4");
    let music = d.path().join("Muzyka Łódź.wav");
    run(
        &ff,
        &[
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=red:s=64x64:r=30:d=8",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=300:sample_rate=48000:duration=8",
            "-af",
            "volume=if(between(t\\,1.85\\,2.25)+between(t\\,4.10\\,4.45)\\,0\\,1):eval=frame",
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
    run(
        &ff,
        &[
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=900:duration=8",
            "-c:a",
            "pcm_s16le",
        ],
        &music,
    );
    let p = fixture("input", &voice, &music);
    let job = Arc::new(Job::new(2));
    let result =
        smart_cut::analyze(&job, &ff, &p, "voice028", None, 2., 4., "test".into()).unwrap();
    assert_eq!(result.edges.len(), 2);
    for (edge, (a, b)) in result.edges.iter().zip([(1.85, 2.25), (4.10, 4.45)]) {
        assert!(edge.available);
        assert!(edge.to - edge.from <= 1.61);
        assert!(
            edge.pauses
                .iter()
                .any(|x| (x.start - a).abs() < 0.06 && (x.end - b).abs() < 0.06),
            "{:?}",
            edge
        );
    }
    let old = smart_cut::fingerprint(&p, &ff).unwrap();
    fs::OpenOptions::new()
        .append(true)
        .open(&music)
        .unwrap()
        .set_len(fs::metadata(&music).unwrap().len() + 1)
        .unwrap();
    assert_ne!(old, smart_cut::fingerprint(&p, &ff).unwrap());
    let cancelled = Arc::new(Job::new(3));
    cancelled.cancel();
    assert!(smart_cut::analyze(
        &cancelled,
        &ff,
        &p,
        "voice028",
        None,
        2.,
        4.,
        "cancel".into()
    )
    .is_err());
    let silent = d.path().join("Bez audio.mp4");
    run(
        &ff,
        &[
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=blue:s=64x64:r=30:d=8",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-an",
        ],
        &silent,
    );
    let p = fixture("input", &silent, &music);
    let empty =
        smart_cut::analyze(&job, &ff, &p, "voice028", None, 2., 4., "empty".into()).unwrap();
    assert!(empty
        .edges
        .iter()
        .all(|e| !e.available && e.pauses.is_empty()));
}
