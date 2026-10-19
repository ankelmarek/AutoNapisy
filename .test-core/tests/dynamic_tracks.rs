//! Real V3/A3 picture, six independent tones, routing, transitions and proxy regression.
use autonapisy_core_tests::{
    mlt, montage, project, proxy, rendering, timeline_audio, transcription::Job,
};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
};
fn run(ff: &Path, args: &[&str]) {
    let out = Command::new(ff).args(args).output().unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
}
fn pixel(ff: &Path, file: &Path, time: &str) -> Vec<u8> {
    let out = Command::new(ff)
        .args(["-v", "error", "-ss", time, "-i"])
        .arg(file)
        .args([
            "-vf",
            "scale=1:1",
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
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert_eq!(out.stdout.len(), 3);
    out.stdout
}
fn tones(ff: &Path, file: &Path) -> Vec<f64> {
    let out = Command::new(ff)
        .args(["-v", "error", "-ss", "2.1", "-i"])
        .arg(file)
        .args([
            "-t", "0.25", "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1",
        ])
        .output()
        .unwrap();
    assert!(out.status.success());
    let samples: Vec<f64> = out
        .stdout
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()) as f64)
        .collect();
    assert!(samples.len() > 10000);
    [330., 440., 550., 660., 770., 880.]
        .iter()
        .map(|hz| {
            let (mut a, mut b) = (0., 0.);
            for (i, x) in samples.iter().enumerate() {
                let phase = std::f64::consts::TAU * hz * i as f64 / 48000.;
                a += x * phase.cos();
                b += x * phase.sin();
            }
            (a * a + b * b).sqrt() / samples.len() as f64
        })
        .collect()
}
#[test]
#[ignore = "requires ROLVIXA_MLT and AUTONAPISY_FFMPEG; actual dynamic multitrack rendering"]
fn three_video_three_audio_routing_transitions_and_proxy() {
    let ff = PathBuf::from(std::env::var_os("AUTONAPISY_FFMPEG").unwrap());
    let melt = fs::canonicalize(std::env::var_os("ROLVIXA_MLT").unwrap()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let mut files = vec![];
    for (i, color) in ["red", "blue", "lime"].iter().enumerate() {
        let p = dir.path().join(format!("Film {i} Łódź.mp4"));
        run(
            &ff,
            &[
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                &format!("color=c={color}:s=160x90:r=30:d=4"),
                "-f",
                "lavfi",
                "-i",
                &format!(
                    "sine=frequency={}:sample_rate=48000:duration=4",
                    330 + i * 110
                ),
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                p.to_str().unwrap(),
            ],
        );
        files.push(fs::canonicalize(p).unwrap());
    }
    for i in 0..3 {
        let p = dir.path().join(format!("Audio {i} Zażółć.wav"));
        run(
            &ff,
            &[
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                &format!(
                    "sine=frequency={}:sample_rate=48000:duration=4",
                    660 + i * 110
                ),
                "-c:a",
                "pcm_s16le",
                p.to_str().unwrap(),
            ],
        );
        files.push(fs::canonicalize(p).unwrap());
    }
    let original: Vec<_> = files
        .iter()
        .map(fs::read)
        .collect::<Result<_, _>>()
        .unwrap();
    let layout:Vec<_>=[("video","V"),("audio","A")].iter().flat_map(|(kind,prefix)|(0..3).map(move|index|serde_json::json!({"id":format!("{prefix}{}",index+1),"kind":kind,"index":index}))).collect();
    let assets:Vec<_>=(1..6).map(|i|serde_json::json!({"id":format!("s{i}"),"path":files[i],"name":format!("Źródło {i}"),"duration":4,"kind":if i<3{"video"}else{"audio"},"segments":[]})).collect();
    let clips = vec![
        serde_json::json!({"id":"v1","start":0,"sourceIn":0,"sourceOut":4,"track":0,"volume":0.4,"audioRoute":"A1"}),
        serde_json::json!({"id":"v2","assetId":"s1","start":0.5,"sourceIn":0,"sourceOut":3,"track":1,"volume":0.4,"audioRoute":"A2"}),
        serde_json::json!({"id":"v3","assetId":"s2","start":1,"sourceIn":0,"sourceOut":2.5,"track":2,"volume":0.4,"audioRoute":"embedded","audio":{"points":[{"id":"p","time":0,"gain":0.8}],"fadeIn":{"anchor":0,"duration":1}}}),
        serde_json::json!({"id":"a1","assetId":"s3","kind":"audio","start":0,"sourceIn":0,"sourceOut":4,"track":0,"volume":0.4}),
        serde_json::json!({"id":"a2","assetId":"s4","kind":"audio","start":0,"sourceIn":0,"sourceOut":4,"track":1,"volume":0.4}),
        serde_json::json!({"id":"a3","assetId":"s5","kind":"audio","start":0,"sourceIn":0,"sourceOut":4,"track":2,"volume":0.4}),
    ];
    let p=project::parse(&serde_json::json!({"schemaVersion":11,"name":"Rzeczywiste V3 A3 Łódź","trackLayout":layout,"media":{"path":files[0],"name":"Pierwszy","duration":4},"assets":assets,"clips":clips,"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-18T00:00:00Z","updatedAt":"2026-10-18T00:00:00Z"}).to_string()).unwrap();
    let job = Arc::new(Job::new(1));
    let meta = rendering::inspect(&job, &ff, &files[0], dir.path()).unwrap();
    let render = |name: &str, p: &project::Project, mlt_engine: bool| {
        let target = dir.path().join(name);
        fs::create_dir(&target).unwrap();
        if mlt_engine {
            mlt::assemble(&job, &melt, &ff, p, &meta, &target).unwrap()
        } else {
            montage::assemble(&job, &ff, &files[0], &target, p, &meta).unwrap()
        }
    };
    for engine in [false, true] {
        let tag = if engine { "mlt" } else { "ffmpeg" };
        let out = render(&format!("{tag}-base"), &p, engine);
        for (time, channel) in [("0.2", 0), ("0.8", 2), ("1.5", 1), ("3.8", 0)] {
            let px = pixel(&ff, &out, time);
            assert!(px[channel] > 180, "{tag} layer {time}: {px:?}");
        }
        let energy = tones(&ff, &out);
        let baseline = energy.clone();
        for (i, e) in energy.iter().enumerate() {
            assert!(
                *e > 0.009 && *e < 0.04,
                "{tag} missing/duplicated tone {i}: {energy:?}"
            );
        }
        // Stable V1 can be moved above V3; both engines must render red while preserving all six tones.
        let mut reordered=p.clone();let i=reordered.track_layout.iter().position(|t|t.id=="V1").unwrap();let v1=reordered.track_layout.remove(i);reordered.track_layout.push(v1);
        let out=render(&format!("{tag}-reordered-v1"),&reordered,engine);let px=pixel(&ff,&out,"2.2");assert!(px[0]>180&&px[1]<50,"{tag} reordered V1 must cover V3: {px:?}");let e=tones(&ff,&out);for i in 0..6{assert!((e[i]/baseline[i]-1.).abs()<0.12,"{tag} reorder changed audio: {e:?}");}
        let mut audition=p.clone();for c in audition.clips.as_mut().unwrap(){if c.id!="v3"{c.volume=0.;}}let out=render(&format!("{tag}-solo-v3-audition"),&audition,engine);let e=tones(&ff,&out);assert!(e[2]>0.009,"{tag} solo lost selected tone: {e:?}");for i in [0,1,3,4,5]{assert!(e[i]<0.001,"{tag} solo leaked tone: {e:?}");}
        let legacy=serde_json::from_str::<serde_json::Value>(&serde_json::to_string(&reordered).unwrap()).unwrap();let mut legacy=legacy;legacy["schemaVersion"]=12.into();let migrated=project::parse(&legacy.to_string()).unwrap();assert_eq!(migrated.video_rank(2),2);
        let mut hidden = p.clone();
        hidden.tracks.extra.entry("V3".into()).or_default().hidden = true;
        hidden.tracks.extra.entry("A3".into()).or_default().muted = true;
        let out = render(&format!("{tag}-hidden-muted-a3"), &hidden, engine);
        let px = pixel(&ff, &out, "2.2");
        assert!(px[2] > 180, "{tag}: hidden V3 must reveal V2 {px:?}");
        let energy = tones(&ff, &out);
        assert!(
            energy[5] < 0.001 && energy[2] > 0.009,
            "{tag} A3 must not mute embedded V3: {energy:?}"
        );
        let mut muted = p.clone();
        muted.tracks.extra.entry("V3".into()).or_default().muted = true;
        let out = render(&format!("{tag}-muted-v3"), &muted, engine);
        assert!(pixel(&ff, &out, "2.2")[1] > 180);
        let energy = tones(&ff, &out);
        assert!(
            energy[2] < 0.001 && energy[5] > 0.009,
            "{tag} V3 mute: {energy:?}"
        );
        let mut detached = p.clone();
        let mut sound = detached.clips.as_ref().unwrap()[2].clone();
        sound.id = "detached".into();
        sound.kind = "audio".into();
        sound.audio_route = None;
        sound.start = 0.5;
        sound.source_out = 3.;
        detached.clips.as_mut().unwrap()[2].audio_detached = true;
        detached.clips.as_mut().unwrap().push(sound);
        let out = render(&format!("{tag}-detached-j-cut"), &detached, engine);
        let energy = tones(&ff, &out);
        assert!(
            (energy[2] / baseline[2] - 1.).abs() < 0.12,
            "{tag} duplicated detached sound: {energy:?}"
        );
        let mut transition = p.clone();
        transition.clips.as_mut().unwrap()[2].source_out = 1.5;
        let mut next = transition.clips.as_ref().unwrap()[2].clone();
        next.id = "next".into();
        next.asset_id = Some("s1".into());
        next.start = 2.5;
        next.source_in = 0.5;
        next.source_out = 2.;
        transition.clips.as_mut().unwrap().push(next);
        transition.transitions.push(project::Transition {
            id: "v3-fade".into(),
            from_id: "v3".into(),
            to_id: "next".into(),
            kind: "fade".into(),
            duration: 0.5,
        });
        project::parse(&serde_json::to_string(&transition).unwrap()).unwrap();
        let out = render(&format!("{tag}-v3-transition"), &transition, engine);
        let px = pixel(&ff, &out, "2.25");
        assert!(px[1] > 40 && px[2] > 40, "{tag} V3 transition: {px:?}");
    }
    let mut framed = p.clone();
    framed.clips.as_mut().unwrap()[2].transform = Some(project::Transform {
        scale: 0.5,
        x: 0.,
        y: 0.,
    });
    let framed_out = render("mlt-three-layer-framing", &framed, true);
    let px = pixel(&ff, &framed_out, "2.2");
    assert!(
        px[2] > 140 && px[1] > 35,
        "Scaled V3 must leave V2 visible behind it: {px:?}"
    );
    let info = proxy::inspect(&job, &ff, &files[2], dir.path()).unwrap();
    let stamp = proxy::stamp(&files[2]).unwrap();
    let cache = dir.path().join("Proxy Łódź");
    let generated =
        proxy::generate(&job, &ff, &cache, &stamp, &info, 540, 64 * 1024 * 1024).unwrap();
    let map = HashMap::from([(files[2].to_str().unwrap().to_owned(), generated.output.path)]);
    let preview = proxy::substitute(&p, &map);
    assert_eq!(
        serde_json::to_value(&preview.track_layout).unwrap(),
        serde_json::to_value(&p.track_layout).unwrap()
    );
    assert_ne!(preview.assets[1].path, p.assets[1].path);
    let out = render("mlt-v3-proxy", &preview, true);
    assert!(pixel(&ff, &out, "2.2")[1] > 180);
    assert!(tones(&ff, &out)[2] > 0.009);
    let ranges = timeline_audio::plan(&job, &ff, &p, dir.path()).unwrap();
    assert_eq!(ranges.len(), 1);
    assert!((ranges[0].duration - 4.).abs() < 0.04);
    let mut offline = p.clone();
    offline.assets[1].path = dir
        .path()
        .join("Brakujący film.mp4")
        .to_string_lossy()
        .into_owned();
    assert!(timeline_audio::plan(&job, &ff, &offline, dir.path()).is_err());
    for (file, bytes) in files.iter().zip(original) {
        assert_eq!(fs::read(file).unwrap(), bytes);
    }
    println!("Actual dynamic V3/A3: three pictures, six unique audio tones without duplication, mute/visibility/routing, detached J-cut, V3 transition, proxy and missing media: OK");
}
