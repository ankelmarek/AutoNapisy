//! Short, source-bound re-recognition. This is NOT forced alignment. No prompt
//! containing edited text is sent to Whisper, and independent music is excluded.
use crate::{
    project::{Clip, Project, Segment},
    transcription::{self, Job, Tools},
};
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    sync::Arc,
};
pub const MAX_SECONDS: f64 = 30.;
#[derive(Clone, Debug)]
pub struct Fragment {
    pub path: PathBuf,
    pub sound: Clip,
    pub from: f64,
    pub duration: f64,
}
pub fn stamp(path: &Path) -> Result<String, String> {
    let m = std::fs::metadata(path).map_err(|e| format!("Nie można odczytać źródła: {e}"))?;
    let modified = m
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    Ok(format!("{}:{}", m.len(), modified.as_nanos()))
}
pub fn fragment(p: &Project, caption_id: &str, from: f64, to: f64) -> Result<Fragment, String> {
    if caption_id.len() > 10000 {
        return Err("Zbyt długi identyfikator napisu".into());
    }
    if p.tracks.state("T").is_some_and(|t| t.locked) {
        return Err("Ścieżka napisów jest zablokowana".into());
    }
    if !from.is_finite()
        || !to.is_finite()
        || from < 0.
        || to - from < 0.05
        || to - from > MAX_SECONDS
    {
        return Err("Dopasuj jeden napis o długości 0,05–30 s".into());
    }
    let patch = p.caption_edits.get(caption_id);
    if patch.is_some_and(|e| e.hidden) {
        return Err("Napis jest ukryty".into());
    }
    let mut p = p.clone();
    if p.clips.is_none() {
        p.clips = Some(
            p.media
                .as_ref()
                .and_then(|m| m.duration)
                .map(|duration| {
                    vec![Clip {
                        id: "original".into(),
                        start: 0.,
                        source_in: 0.,
                        source_out: duration,
                        kind: "video".into(),
                        volume: 1.,
                        ..Default::default()
                    }]
                })
                .unwrap_or_default(),
        );
    }
    let clips = p.clips.as_deref().unwrap_or(&[]);
    if let Some(id) = caption_id.strip_prefix("timeline:") {
        let s = p
            .timeline_segments
            .as_ref()
            .and_then(|s| s.iter().find(|s| s.id == id))
            .ok_or("Brak napisu montażu")?;
        let a = s.start + patch.map_or(0., |e| e.trim_start);
        let b = s.end - patch.map_or(0., |e| e.trim_end);
        if (from - a).abs() > 1e-6 || (to - b).abs() > 1e-6 {
            return Err("Zakres napisu zmienił się. Otwórz edycję ponownie".into());
        }
    } else {
        let (clip, source, index): (String, String, usize) =
            serde_json::from_str(caption_id).map_err(|_| "Nieznany identyfikator napisu")?;
        if index > 200 {
            return Err("Nieprawidłowy fragment napisu".into());
        }
        let c = clips
            .iter()
            .find(|c| c.id == clip && c.kind != "audio")
            .ok_or("Brak filmu napisu")?;
        let segments = c
            .asset_id
            .as_ref()
            .and_then(|id| p.assets.iter().find(|a| &a.id == id))
            .map_or(p.segments.as_slice(), |a| a.segments.as_slice());
        let s = segments
            .iter()
            .find(|s| s.id == source)
            .ok_or("Brak źródłowego napisu")?;
        let offset = c.start - c.source_in;
        if from < (s.start + offset).max(c.start) - 1e-6
            || to > (s.end + offset).min(c.end()) + 1e-6
        {
            return Err("Napis wykracza poza źródłowy fragment filmu".into());
        }
    }
    let speech = transcription::voice_project(&p, None)?;
    let active: Vec<_> = speech
        .clips
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter(|c| c.start < to - 1e-7 && c.end() > from + 1e-7)
        .collect();
    if active.len() != 1 {
        return Err("Zakres przecina kilka fragmentów lub nakładających się wypowiedzi. Ustaw czasy ręcznie".into());
    }
    let sound = active[0];
    if sound.start > from + 1e-6 || sound.end() < to - 1e-6 {
        return Err("Powiązany dźwięk nie obejmuje całego napisu. Ustaw czasy ręcznie".into());
    }
    // Source-caption identities must still address this sound, not an unrelated
    // audible picture underneath a muted/removed original.
    if !caption_id.starts_with("timeline:") {
        let (id, _, _): (String, String, usize) = serde_json::from_str(caption_id).unwrap();
        let picture = clips.iter().find(|c| c.id == id).unwrap();
        if picture.asset_id != sound.asset_id
            || (!picture.audio_detached
                && (picture.start - picture.source_in - (sound.start - sound.source_in)).abs()
                    > 1e-6)
            || (picture.audio_detached
                && (picture.sync_group.is_none() || picture.sync_group != sound.sync_group))
            || p.tracks
                .state(&format!("V{}", picture.track + 1))
                .is_some_and(|t| t.muted)
            || (!picture.audio_detached && p.tracks.audio_muted(picture))
        {
            return Err("Dźwięk źródła napisu jest wyciszony lub niedostępny".into());
        }
    }
    let path = PathBuf::from(p.clip_path(sound).ok_or("Brak źródła dźwięku")?);
    Ok(Fragment {
        path,
        sound: sound.clone(),
        from,
        duration: to - from,
    })
}
pub fn extract(job: &Arc<Job>, ffmpeg: &Path, f: &Fragment, dir: &Path) -> Result<(), String> {
    let source = f.sound.source_in + f.from - f.sound.start;
    let gain = crate::audio_envelope::expression(&f.sound, &format!("(t+{source})"));
    let mut args: Vec<OsString> = [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        &source.to_string(),
        "-t",
        &f.duration.to_string(),
        "-protocol_whitelist",
        "file,pipe",
        "-i",
    ]
    .iter()
    .map(Into::into)
    .collect();
    args.push(f.path.clone().into_os_string());
    args.extend(
        [
            "-map",
            "0:a:0",
            "-vn",
            "-af",
            &format!("asetpts=PTS-STARTPTS,volume='{gain}':eval=frame"),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            "-t",
            &f.duration.to_string(),
        ]
        .iter()
        .map(Into::into),
    );
    args.push(dir.join("audio.wav").into_os_string());
    transcription::run_process_bounded(
        job,
        ffmpeg,
        &args,
        dir,
        &dir.join("audio.wav"),
        2 * 1024 * 1024,
    )?;
    let mut wav = hound::WavReader::open(dir.join("audio.wav")).map_err(|e| e.to_string())?;
    if (wav.duration() as f64 / 16000. - f.duration).abs() > 0.025 {
        return Err("Źródło zmieniło długość lub brakuje dźwięku".into());
    }
    let samples: Vec<_> = wav
        .samples::<i16>()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let audible = samples
        .chunks(160)
        .filter(|s| {
            s.iter().map(|x| (*x as f64 / 32768.).powi(2)).sum::<f64>() / s.len() as f64
                > 0.0005_f64.powi(2)
        })
        .count();
    if audible < 8 {
        return Err(
            "Fragment jest cichy lub nie zawiera wystarczającego sygnału mowy. Ustaw czasy ręcznie"
                .into(),
        );
    }
    Ok(())
}
pub fn execute(job: Arc<Job>, tools: Tools, f: Fragment) -> Result<(Vec<Segment>, f64), String> {
    let before = stamp(&f.path)?;
    let dir = tempfile::Builder::new()
        .prefix("rolvixa-caption-")
        .tempdir()
        .map_err(|e| e.to_string())?;
    extract(
        &job,
        tools.ffmpeg.as_deref().ok_or("Brak FFmpeg")?,
        &f,
        dir.path(),
    )?;
    let result = transcription::recognize(job.clone(), tools, dir.path())?;
    if stamp(&f.path)? != before {
        return Err("Plik źródłowy zmienił się podczas analizy. Wynik odrzucony".into());
    }
    job.check()?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn seed() -> Project {
        crate::project::parse(&serde_json::json!({"schemaVersion":18,"name":"PL","media":{"path":"Łódź.mp4","name":"Łódź","duration":10},"clips":[{"id":"v","start":5,"sourceIn":2,"sourceOut":8,"audioRoute":"A1"}],"segments":[],"timelineSegments":[{"id":"s","text":"A B","start":6,"end":8,"styleId":"default","words":[]}],"styles":{"default":{"fontFamily":"Bebas Neue","fontSize":56,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-21T00:00:00Z","updatedAt":"2026-10-21T00:00:00Z"}).to_string()).unwrap()
    }
    #[test]
    fn clock_and_bounds_are_derived_from_linked_audio() {
        let p = seed();
        let f = fragment(&p, "timeline:s", 6., 8.).unwrap();
        assert_eq!(f.sound.source_in + f.from - f.sound.start, 3.);
        assert_eq!(f.duration, 2.);
        for (a, b) in [(0., 2.), (6., 40.), (f64::NAN, 8.), (6., 6.)] {
            assert!(fragment(&p, "timeline:s", a, b).is_err());
        }
        assert!(fragment(&p, "timeline:missing", 6., 8.).is_err());
    }
    #[test]
    fn muted_routes_lock_and_overlapping_voices_are_rejected() {
        let mut p = seed();
        p.tracks.captions.locked = true;
        assert!(fragment(&p, "timeline:s", 6., 8.).is_err());
        p.tracks.captions.locked = false;
        p.tracks.a1.muted = true;
        assert!(fragment(&p, "timeline:s", 6., 8.).is_err());
        p.tracks.a1.muted = false;
        let mut second = p.clips.as_ref().unwrap()[0].clone();
        second.id = "other".into();
        second.track = 1;
        p.clips.as_mut().unwrap().push(second);
        assert!(fragment(&p, "timeline:s", 6., 8.).is_err());
    }
    #[test]
    fn source_identity_cannot_fall_through_to_another_audible_picture() {
        let mut p = seed();
        p.timeline_segments = None;
        p.segments = vec![Segment {
            id: "s".into(),
            text: "A B".into(),
            start: 3.,
            end: 5.,
            words: vec![],
            style_id: "default".into(),
        }];
        assert!(fragment(&p, "[\"v\",\"s\",0]", 6., 8.).is_ok());
        let mut other = p.clips.as_ref().unwrap()[0].clone();
        other.id = "other".into();
        other.track = 1;
        other.source_in = 3.;
        other.source_out = 9.;
        other.audio_route = Some("A2".into());
        p.clips.as_mut().unwrap().push(other);
        p.tracks.v1.muted = true;
        assert!(fragment(&p, "[\"v\",\"s\",0]", 6., 8.).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn deadline_kills_and_reaps_without_changing_cancel_state() {
        let job = Arc::new(Job::new(0));
        *job.deadline.lock().unwrap() = Some(std::time::Instant::now());
        let dir = tempfile::tempdir().unwrap();
        let now = std::time::Instant::now();
        let error = transcription::run_process(
            &job,
            Path::new("/bin/sleep"),
            &["10".into()],
            false,
            dir.path(),
        )
        .unwrap_err();
        assert!(error.contains("limit"));
        assert!(now.elapsed().as_secs() < 2);
        assert!(!job.cancel.load(std::sync::atomic::Ordering::SeqCst));
    }
}
