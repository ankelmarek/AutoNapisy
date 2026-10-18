//! The positions asserted by TypeScript's planEdit are rendered by both real engines.
use autonapisy_core_tests::{audio_envelope, mlt, montage, project, rendering, transcription::Job};
use std::{fs, path::Path, process::Command, sync::Arc};
fn tones(ff: &Path, file: &Path, time: f64) -> [f64; 2] {
    let o = Command::new(ff)
        .args(["-v", "error", "-ss", &time.to_string(), "-i"])
        .arg(file)
        .args([
            "-t", "0.2", "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1",
        ])
        .output()
        .unwrap();
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
    let samples: Vec<_> = o
        .stdout
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()) as f64)
        .collect();
    assert!(
        samples.len() > 9000,
        "Short decoded audio at {time}: {} samples in {}",
        samples.len(),
        file.display()
    );
    [330., 880.].map(|hz| {
        let (mut a, mut b) = (0., 0.);
        for (i, x) in samples.iter().enumerate() {
            let ph = std::f64::consts::TAU * hz * i as f64 / 48000.;
            a += x * ph.cos();
            b += x * ph.sin();
        }
        (a * a + b * b).sqrt() / samples.len() as f64
    })
}
#[test]
#[ignore = "requires real MLT and FFmpeg"]
fn ripple_preserves_independent_music_same_bus_and_detached_j_l_mix() {
    let ff = std::path::PathBuf::from(std::env::var_os("AUTONAPISY_FFMPEG").unwrap());
    let melt = fs::canonicalize(std::env::var_os("ROLVIXA_MLT").unwrap()).unwrap();
    let d = tempfile::tempdir().unwrap();
    let film = d.path().join("Film Łódź.mp4");
    let music = d.path().join("Muzyka Łódź.wav");
    for (path, video, hz) in [(&film, true, 330), (&music, false, 880)] {
        let mut cmd = Command::new(&ff);
        cmd.args(["-v", "error", "-y"]);
        if video {
            cmd.args(["-f", "lavfi", "-i", "color=red:s=64x64:r=30:d=16"]);
        }
        cmd.args([
            "-f",
            "lavfi",
            "-i",
            &format!("sine=frequency={hz}:sample_rate=48000:duration=16"),
        ]);
        if video {
            cmd.args([
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
            ]);
        } else {
            cmd.args(["-c:a", "pcm_s16le"]);
        }
        let o = cmd.arg(path).output().unwrap();
        assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
    }
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/ripple025.json")).unwrap();
    let job = Arc::new(Job::new(1));
    for sample in fixture["cases"].as_array().unwrap() {
        let name = sample["name"].as_str().unwrap();
        let mut clips = fixture["clips"].as_array().unwrap().clone();
        clips.extend(sample["extra"].as_array().unwrap().clone());
        clips.retain(|c| c["id"] != "middle");
        for c in &mut clips {
            c["start"] = sample["expectedStarts"][c["id"].as_str().unwrap()].clone();
            if sample["detachLast"] == true && c["id"] == "last" {
                c["audioDetached"] = true.into();
                c["audioRoute"] = "embedded".into();
                c["syncGroup"] = "pair".into();
            }
        }
        let p=project::parse(&serde_json::json!({"schemaVersion":12,"rippleEnabled":true,"name":name,"media":{"path":film,"name":"Film","duration":16},"assets":[{"id":"music","kind":"audio","path":music,"name":"Muzyka","duration":16,"segments":[]}],"clips":clips,"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":40,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-18T00:00:00Z","updatedAt":"2026-10-18T00:00:00Z"}).to_string()).unwrap();
        let meta = rendering::Metadata {
            width: 64,
            height: 64,
            duration: 13.,
            has_audio: true,
        };
        let folder = d.path().join(name);
        fs::create_dir(&folder).unwrap();
        fs::write(
            folder.join("timeline.mlt"),
            mlt::xml(&p, &meta, &[], None).unwrap(),
        )
        .unwrap();
        let preview = mlt::run(&job, &melt, &folder, 0, 389, false, true).unwrap();
        for engine in ["preview", "mlt", "ffmpeg"] {
            let file = if engine == "preview" {
                preview.clone()
            } else {
                let out = folder.join(engine);
                fs::create_dir(&out).unwrap();
                if engine == "mlt" {
                    mlt::assemble(&job, &melt, &ff, &p, &meta, &out).unwrap()
                } else {
                    montage::assemble(&job, &ff, &film, &out, &p, &meta).unwrap()
                }
            };
            for t in [0.5, 2.5, 4.5, 6.5, 8.5, 10.5, 12.5] {
                let end = p
                    .clips
                    .as_ref()
                    .unwrap()
                    .iter()
                    .map(|c| c.start + c.source_out - c.source_in)
                    .fold(0., f64::max);
                if t + 0.2 > end {
                    continue;
                }
                let actual = tones(&ff, &file, t);
                let mut expected = [0., 0.];
                for c in p.clips.as_ref().unwrap() {
                    if t >= c.start && t + 0.2 <= c.start + c.source_out - c.source_in {
                        let i = if c.asset_id.as_deref() == Some("music") {
                            1
                        } else {
                            0
                        };
                        expected[i] +=
                            0.0625 * audio_envelope::gain(c, c.source_in + t + 0.1 - c.start);
                    }
                }
                for i in 0..2 {
                    assert!(
                        (actual[i] - expected[i]).abs() < 0.004,
                        "{name}/{engine} at {t}: {actual:?} != {expected:?}"
                    );
                }
            }
        }
    }
}
