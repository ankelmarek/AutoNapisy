//! Shared production TS cut/cover, original MLT frames and both final renderers.
use autonapisy_core_tests::{
    mlt, montage, project, rendering, smart_cut_visual, transcription::Job,
};
use base64::Engine;
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
fn seed(name: &str, voice: &Path, music: &Path) -> project::Project {
    let mut v: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/smartcut030.json")).unwrap();
    v[name]["media"]["path"] = voice.to_str().unwrap().into();
    v[name]["assets"][0]["path"] = music.to_str().unwrap().into();
    project::parse(&v[name].to_string()).unwrap()
}
fn rgb(png: &str) -> Vec<u8> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png)
        .unwrap();
    let mut reader = png::Decoder::new(bytes.as_slice()).read_info().unwrap();
    let mut out = vec![0; reader.output_buffer_size()];
    let n = reader.next_frame(&mut out).unwrap();
    out.truncate(n.buffer_size());
    out
}
fn pixel(ff: &Path, path: &Path, t: f64) -> Vec<u8> {
    let o = Command::new(ff)
        .args(["-v", "error", "-ss", &t.to_string(), "-i"])
        .arg(path)
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
    assert_eq!(o.stdout.len(), 3);
    o.stdout
}
fn tones(ff: &Path, path: &Path, t: f64) -> [f64; 3] {
    let o = Command::new(ff)
        .args(["-v", "error", "-i"])
        .arg(path)
        .args(["-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"])
        .output()
        .unwrap();
    assert!(o.status.success());
    let samples: Vec<_> = o
        .stdout
        .chunks_exact(4)
        .skip((t * 48000.).round() as usize)
        .take(2400)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()) as f64)
        .collect();
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
#[test]
#[ignore = "requires real MLT and FFmpeg"]
fn actual_picture_comparison_cover_mix_and_export_match_the_shared_planner() {
    let ff = PathBuf::from(std::env::var_os("AUTONAPISY_FFMPEG").unwrap());
    let melt = fs::canonicalize(std::env::var_os("ROLVIXA_MLT").unwrap()).unwrap();
    let d = tempfile::tempdir().unwrap();
    let voice = d.path().join("Przebitka Łódź.mp4");
    let music = d.path().join("Muzyka Łódź.wav");
    run(&ff,&["-v","error","-y","-f","lavfi","-i","color=red:s=320x180:r=30:d=8,drawbox=color=blue:t=fill:enable='gte(t,3)',drawbox=color=lime:t=fill:enable='gte(t,6)'","-f","lavfi","-i","aevalsrc=0.125*sin(2*PI*if(lt(t\\,3)\\,300\\,600)*t):s=48000:d=8","-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-c:a","aac"],&voice);
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
    let job = Arc::new(Job::new(0));
    let cut = seed("cut", &voice, &music);
    let covered = seed("covered", &voice, &music);
    let window = seed("window", &voice, &music);
    let before = serde_json::to_string(&cut).unwrap();
    let analysis = smart_cut_visual::analyze(&job, &melt, &ff, &cut, 2., "sample".into()).unwrap();
    assert_eq!(analysis.verdict, "jump");
    assert!((analysis.before.time - 59. / 30.).abs() < 1e-6);
    assert_eq!(analysis.after.time, 2.);
    assert!(rgb(&analysis.before.png)[0] > 200);
    assert!(rgb(&analysis.after.png)[2] > 200);
    assert_eq!(before, serde_json::to_string(&cut).unwrap());
    let hidden =
        smart_cut_visual::analyze(&job, &melt, &ff, &window, 2., "covered".into()).unwrap();
    assert_eq!(hidden.verdict, "quiet");
    assert!(rgb(&hidden.before.png)[1] > 200);
    assert!(rgb(&hidden.after.png)[1] > 200);
    // The original picture transforms, track order and eye apply to the measured composition.
    let mut moved = cut.clone();
    moved.clips.as_mut().unwrap()[0].transform = Some(project::Transform {
        scale: 1.,
        x: 2.,
        y: 0.,
    });
    let black = smart_cut_visual::analyze(&job, &melt, &ff, &moved, 2., "crop".into()).unwrap();
    assert!(rgb(&black.before.png).iter().all(|x| *x < 5));
    let mut hidden_cut = cut.clone();
    hidden_cut.tracks.v1.hidden = true;
    let black = smart_cut_visual::analyze(&job, &melt, &ff, &hidden_cut, 2., "eye".into()).unwrap();
    assert_eq!(black.verdict, "quiet");
    assert!(rgb(&black.after.png).iter().all(|x| *x < 5));
    let meta = rendering::inspect(&job, &ff, &voice, d.path()).unwrap();
    let mut reference = vec![];
    for (name, p) in [("cut", &cut), ("cover", &covered)] {
        for engine in ["mlt", "ffmpeg"] {
            let dir = d.path().join(format!("{name}-{engine}"));
            fs::create_dir(&dir).unwrap();
            let file = if engine == "mlt" {
                mlt::assemble(&job, &melt, &ff, p, &meta, &dir).unwrap()
            } else {
                montage::assemble(&job, &ff, &voice, &dir, p, &meta).unwrap()
            };
            for time in [1.6, 2.2] {
                let pixels = pixel(&ff, &file, time);
                assert!(
                    pixels[if name == "cover" {
                        1
                    } else if time < 2. {
                        0
                    } else {
                        2
                    }] > 180,
                    "{name}/{engine}: {pixels:?}"
                );
                let signal = tones(&ff, &file, time);
                if name == "cut" {
                    reference.push((engine, time, signal));
                } else {
                    let old = reference
                        .iter()
                        .find(|(e, t, _)| *e == engine && (*t - time).abs() < 1e-6)
                        .unwrap()
                        .2;
                    for i in 0..3 {
                        assert!(
                            (signal[i] - old[i]).abs() < 0.003,
                            "Cover changed voice/music: {signal:?} vs {old:?}"
                        );
                    }
                    assert!(
                        signal[0] < 0.002 || time < 2.,
                        "Cover's source audio leaked"
                    );
                }
            }
        }
    }
    assert_eq!(
        cut.timeline_segments.as_ref().unwrap()[0].text,
        covered.timeline_segments.as_ref().unwrap()[0].text
    );
    let key = smart_cut_visual::fingerprint(&cut, &ff, &melt).unwrap();
    let mut changed = cut.clone();
    changed.clips.as_mut().unwrap()[0].volume = 0.1;
    assert_ne!(
        key,
        smart_cut_visual::fingerprint(&changed, &ff, &melt).unwrap()
    );
    assert!(smart_cut_visual::analyze(&job, &melt, &ff, &cut, 0., "bad".into()).is_err());
    assert!(smart_cut_visual::analyze(&job, &melt, &ff, &cut, 8., "bad".into()).is_err());
    let cancel = Arc::new(Job::new(0));
    cancel.cancel();
    assert!(smart_cut_visual::analyze(&cancel, &melt, &ff, &cut, 2., "cancel".into()).is_err());
}
