//! Shared final/sample encoder. Sizes use decimal MB; only MP4 counts toward the cap.
use crate::{
    export_studio::{self, Entry, Options},
    project::Project,
    rendering::{self, Metadata},
    transcription::{self, Job},
};
use serde::Serialize;
use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::Instant,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Budget {
    pub bytes: u64,
    pub video_bps: u64,
    pub low_quality: bool,
}
pub fn budget(o: &Options, m: &Metadata) -> Result<Option<Budget>, String> {
    o.validate()?;
    let Some(mb) = o.target_mb else {
        return Ok(None);
    };
    if !m.duration.is_finite() || m.duration <= 0. {
        return Err("Nieprawidłowa długość filmu".into());
    }
    let bytes = (mb * 1_000_000.).floor() as u64;
    let reserve = (bytes as f64 * 0.04).max(65536.);
    let bps = (((bytes as f64 - reserve) * 8. / m.duration) - o.audio_kbps as f64 * 1000.).floor();
    if bps < 64000. {
        return Err(
            "Limit MB jest za mały dla dźwięku i obrazu. Zwiększ limit lub zmniejsz bitrate AAC."
                .into(),
        );
    }
    let video_bps = bps.min(200_000_000.) as u64;
    let (w, h) = o.dimensions(m);
    Ok(Some(Budget {
        bytes,
        video_bps,
        low_quality: video_bps as f64 / (w as f64 * h as f64 * 30.) < 0.035,
    }))
}
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleRange {
    pub start: f64,
    pub duration: f64,
}
impl SampleRange {
    pub fn new(start: f64, duration: f64, total: f64) -> Result<Self, String> {
        if !start.is_finite()
            || !duration.is_finite()
            || !total.is_finite()
            || total < 2. / 30.
            || start < 0.
            || duration <= 0.
            || duration > 5.
            || (duration < 3. && total >= 3.)
            || (total < 3. && (start > 1e-6 || (duration - total).abs() > 1. / 30.))
            || start + duration > total + 1e-6
        {
            return Err(
                "Próbka wymaga 3–5 s w granicach montażu; krótszy film można porównać w całości."
                    .into(),
            );
        }
        let first = (start * 30.).round();
        let end = ((start + duration) * 30.)
            .round()
            .min((total * 30.).round());
        if end - first < 2. {
            return Err("Próbka jest zbyt krótka".into());
        }
        Ok(Self {
            start: first / 30.,
            duration: (end - first) / 30.,
        })
    }
}
pub fn caption_intervals(p: &Project, start: f64, duration: f64) -> Vec<rendering::Interval> {
    rendering::timeline(p, start + duration)
        .into_iter()
        .filter_map(|i| {
            let a = i.start.max(start);
            let b = i.end.min(start + duration);
            (b > a).then_some(rendering::Interval {
                index: i.index,
                start: a - start,
                end: b - start,
            })
        })
        .collect()
}
pub fn variants(o: &Options) -> Vec<(String, Options)> {
    let mut rows = Vec::new();
    if o.target_mb.is_some() {
        rows.push(("Wybrany limit MB".into(), o.clone()));
    }
    let crfs = if o.target_mb.is_some() {
        vec![o.crf, o.crf.saturating_add(6).min(35)]
    } else {
        vec![
            o.crf.saturating_sub(6).max(12),
            o.crf,
            o.crf.saturating_add(6).min(35),
        ]
    };
    for crf in crfs {
        if rows
            .iter()
            .any(|(_, v): &(String, Options)| v.target_mb.is_none() && v.crf == crf)
        {
            continue;
        }
        rows.push((
            format!("CRF {crf}"),
            Options {
                crf,
                target_mb: None,
                ..o.clone()
            },
        ));
    }
    rows
}
/// Both samples and final exports call this function with the same graph/PNG/filter/audio settings.
pub fn encode(
    e: &Entry,
    job: &Arc<Job>,
    o: &Options,
    input: &Path,
    dir: &Path,
    start: f64,
    duration: f64,
    max_bytes: u64,
) -> Result<PathBuf, String> {
    o.validate()?;
    let (w, h) = o.dimensions(&e.meta);
    let intervals = caption_intervals(&e.project, start, duration);
    let burn = o.captions == "burn" && intervals.iter().any(|i| i.index.is_some());
    let mut args: Vec<OsString> = ["-v", "error", "-nostdin", "-y", "-i"]
        .iter()
        .map(Into::into)
        .chain(std::iter::once(input.as_os_str().to_owned()))
        .collect();
    let filter = if burn {
        let mut copied = std::collections::HashSet::new();
        for i in intervals.iter().filter_map(|i| i.index) {
            if copied.insert(i) {
                fs::copy(
                    e.dir.path().join(rendering::frame_name(i)),
                    dir.join(rendering::frame_name(i)),
                )
                .map_err(|e| e.to_string())?;
            }
        }
        rendering::empty_png(
            dir,
            &Metadata {
                width: w,
                height: h,
                ..e.meta.clone()
            },
        )?;
        fs::write(
            dir.join("timeline.ffconcat"),
            rendering::concat_text(&intervals),
        )
        .map_err(|e| e.to_string())?;
        args.extend(
            [
                "-protocol_whitelist",
                "file,pipe",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                "timeline.ffconcat",
            ]
            .iter()
            .map(OsString::from),
        );
        format!("[0:v]{}[base];[1:v]format=rgba[subs];[base][subs]overlay=0:0:eof_action=repeat:repeatlast=1,format=yuv420p[v]",o.filter(w,h))
    } else {
        format!("[0:v]{},format=yuv420p[v]", o.filter(w, h))
    };
    args.extend(
        [
            "-filter_complex",
            &filter,
            "-map",
            "[v]",
            "-c:v",
            "libx264",
            "-preset",
            &o.speed,
            "-r",
            "30",
            "-t",
            &duration.to_string(),
            "-progress",
            "pipe:2",
            "-nostats",
            "-map_metadata",
            "-1",
            "-metadata:s:v:0",
            "rotate=0",
        ]
        .iter()
        .map(OsString::from),
    );
    let audio: Vec<OsString> = [
        "-map",
        "0:a:0?",
        "-c:a",
        "aac",
        "-b:a",
        &format!("{}k", o.audio_kbps),
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
    ]
    .iter()
    .map(OsString::from)
    .collect();
    let cap = budget(o, &e.meta)?;
    let output = dir.join("result.mp4");
    let run =
        |extra: Vec<OsString>, message: &str, outputs: &[(&Path, u64)]| -> Result<(), String> {
            job.check()?;
            {
                let mut s = job.status.lock().unwrap();
                s.state = "rendering".into();
                s.message = message.into();
                s.progress = Some(0);
                s.export_info = None;
            }
            *job.progress_duration.lock().unwrap() = Some(duration);
            let mut command = args.clone();
            command.extend(extra);
            transcription::run_process_files_bounded(job, &e.ff, &command, dir, outputs)
        };
    if let Some(cap) = cap {
        let mut bitrate = cap.video_bps;
        let log = dir.join("rate-0.log");
        let mbtree = dir.join("rate-0.log.mbtree");
        let log_temp = dir.join("rate-0.log.temp");
        let mbtree_temp = dir.join("rate-0.log.mbtree.temp");
        for attempt in 0..2 {
            job.check()?;
            for p in [&log, &mbtree, &log_temp, &mbtree_temp, &output] {
                if p.exists() {
                    fs::remove_file(p).map_err(|e| e.to_string())?;
                }
            }
            let base: Vec<OsString> = ["-b:v", &bitrate.to_string(), "-passlogfile", "rate"]
                .iter()
                .map(Into::into)
                .collect();
            let mut first = base.clone();
            first.extend(
                [
                    "-pass",
                    "1",
                    "-an",
                    "-f",
                    "null",
                    if cfg!(windows) { "NUL" } else { "/dev/null" },
                ]
                .iter()
                .map(OsString::from),
            );
            run(
                first,
                "Analiza bitrate · przebieg 1/2",
                &[
                    (&log, 128 * 1024 * 1024),
                    (&mbtree, 256 * 1024 * 1024),
                    (&log_temp, 128 * 1024 * 1024),
                    (&mbtree_temp, 256 * 1024 * 1024),
                ],
            )?;
            let mut second = base;
            second.extend(["-pass", "2"].iter().map(OsString::from));
            second.extend(audio.clone());
            second.push("result.mp4".into());
            run(
                second,
                "Kodowanie do limitu MB · przebieg 2/2",
                &[
                    (&output, max_bytes),
                    (&log, 128 * 1024 * 1024),
                    (&mbtree, 256 * 1024 * 1024),
                    (&log_temp, 128 * 1024 * 1024),
                    (&mbtree_temp, 256 * 1024 * 1024),
                ],
            )?;
            let bytes = fs::metadata(&output).map_err(|e| e.to_string())?.len();
            // A sample uses the bitrate of the entire montage, not the whole budget for 3–5 s.
            if duration < e.meta.duration - 1. / 60. || bytes <= cap.bytes {
                return Ok(output);
            }
            if attempt == 0 {
                bitrate = ((bitrate as f64 * cap.bytes as f64 / bytes as f64 * 0.92).floor()
                    as u64)
                    .max(32000);
            }
        }
        return Err("Wynik przekracza limit MB mimo ponownego kodowania. Nie zapisano pliku; zwiększ limit.".into());
    }
    let mut extra: Vec<OsString> = ["-crf", &o.crf.to_string()]
        .iter()
        .map(Into::into)
        .collect();
    extra.extend(audio);
    extra.push("result.mp4".into());
    run(extra, "Kodowanie H.264 / AAC", &[(&output, max_bytes)])?;
    Ok(output)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Measurement {
    pub index: usize,
    pub label: String,
    pub options: Options,
    pub bytes: u64,
    pub encode_seconds: f64,
    pub estimated_mb: [f64; 2],
    pub estimated_seconds: [f64; 2],
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Comparison {
    pub range: SampleRange,
    pub measurements: Vec<Measurement>,
    pub composition_seconds: f64,
}
pub struct Sample {
    pub entry: Entry,
    pub range: SampleRange,
    pub frames: Vec<usize>,
    _root: tempfile::TempDir,
}
impl Sample {
    pub fn prepare(
        job: Arc<Job>,
        p: Project,
        o: Options,
        ff: PathBuf,
        melt: PathBuf,
        start: f64,
        duration: f64,
    ) -> Result<Self, String> {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let entry = Entry::prepare(p, o, root.path(), ff, melt, job)?;
        let range = SampleRange::new(start, duration, entry.meta.duration)?;
        let frames = entry.select_sample_frames(range.start, range.start + range.duration);
        Ok(Self {
            entry,
            range,
            frames,
            _root: root,
        })
    }
    pub fn path(&self, index: usize) -> Result<PathBuf, String> {
        if index >= variants(&self.entry.options).len() {
            return Err("Nieznany wariant próbki".into());
        }
        Ok(self
            .entry
            .dir
            .path()
            .join(format!("variant-{index}"))
            .join("result.mp4"))
    }
    pub fn run(&self) -> Result<Comparison, String> {
        let e = &self.entry;
        let job = e.job.lock().unwrap().clone();
        e.finish_uploads()?;
        job.check()?;
        if export_studio::source_basis(&e.project, &e.ff, &e.melt)? != e.basis {
            return Err("Źródła zmieniły się. Przygotuj porównanie ponownie.".into());
        }
        let source = e.dir.path().join("source");
        fs::create_dir(&source).map_err(|e| e.to_string())?;
        let at = Instant::now();
        let first = (self.range.start * 30.).round() as i64;
        let last = first + (self.range.duration * 30.).round() as i64 - 1;
        {
            let mut s = job.status.lock().unwrap();
            s.state = "rendering".into();
            s.message = "Składanie próbki z oryginałów · MLT".into();
            s.progress = None;
        }
        let input = export_studio::assemble(
            &job,
            &e.ff,
            &e.melt,
            &e.project,
            &e.meta,
            &source,
            Some((first, last)),
        )?;
        let composition_seconds = at.elapsed().as_secs_f64();
        let mut measurements = Vec::new();
        for (index, (label, options)) in variants(&e.options).into_iter().enumerate() {
            job.check()?;
            let dir = e.dir.path().join(format!("variant-{index}"));
            fs::create_dir(&dir).map_err(|e| e.to_string())?;
            let at = Instant::now();
            let path = encode(
                e,
                &job,
                &options,
                &input,
                &dir,
                self.range.start,
                self.range.duration,
                128 * 1024 * 1024,
            )?;
            let encode_seconds = at.elapsed().as_secs_f64();
            let bytes = fs::metadata(path).map_err(|e| e.to_string())?.len();
            let size = bytes as f64 * e.meta.duration / self.range.duration / 1_000_000.;
            let seconds =
                (composition_seconds + encode_seconds) * e.meta.duration / self.range.duration;
            measurements.push(Measurement {
                index,
                label,
                options,
                bytes,
                encode_seconds,
                estimated_mb: [size * 0.65, size * 1.6],
                estimated_seconds: [seconds * 0.5, seconds * 2.],
            });
        }
        job.check()?;
        if export_studio::source_basis(&e.project, &e.ff, &e.melt)? != e.basis {
            return Err(
                "Źródła zmieniły się podczas porównywania. Przygotuj próbki ponownie.".into(),
            );
        }
        {
            let mut s = job.status.lock().unwrap();
            if job.cancel.load(std::sync::atomic::Ordering::SeqCst) {
                return Err("Anulowano porównanie".into());
            }
            s.state = "completed".into();
            s.message = "Próbki gotowe".into();
            s.progress = Some(100);
        }
        Ok(Comparison {
            range: self.range,
            measurements,
            composition_seconds,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn meta(duration: f64) -> Metadata {
        Metadata {
            width: 1920,
            height: 1080,
            duration,
            has_audio: true,
        }
    }
    #[test]
    fn size_budget_accounts_for_audio_container_and_decimal_mb() {
        let o = Options {
            target_mb: Some(50.),
            ..Default::default()
        };
        let m = meta(60.);
        let b = budget(&o, &m).unwrap().unwrap();
        assert_eq!(b.bytes, 50_000_000);
        assert_eq!(b.video_bps, 6_208_000);
        assert!(b.video_bps * 60 / 8 + 192000 * 60 / 8 < 50_000_000);
        assert!(budget(
            &Options {
                target_mb: Some(0.25),
                ..o.clone()
            },
            &m
        )
        .is_err());
        assert!(budget(
            &Options {
                target_mb: Some(f64::NAN),
                ..o.clone()
            },
            &m
        )
        .is_err());
        assert!(budget(&o, &meta(0.)).is_err());
        assert!(budget(&Options::default(), &m).unwrap().is_none());
        assert!(
            budget(
                &Options {
                    target_mb: Some(2.),
                    ..o
                },
                &m
            )
            .unwrap()
            .unwrap()
            .low_quality
        );
    }
    #[test]
    fn old_profile_options_keep_crf_and_do_not_enable_a_limit() {
        let mut value = serde_json::to_value(Options::default()).unwrap();
        value.as_object_mut().unwrap().remove("targetMb");
        let o: Options = serde_json::from_value(value).unwrap();
        assert_eq!(o.target_mb, None);
        assert_eq!(o.crf, 18);
    }
    #[test]
    fn sample_range_is_bounded_and_frame_accurate() {
        assert_eq!(SampleRange::new(1.01, 4., 10.).unwrap().start, 1.);
        for (a, b, t) in [
            (0., 6., 10.),
            (0., 2., 10.),
            (-1., 3., 10.),
            (8., 3., 10.),
            (f64::NAN, 4., 10.),
            (0.2, 2., 2.5),
        ] {
            assert!(SampleRange::new(a, b, t).is_err());
        }
        assert_eq!(SampleRange::new(0., 2., 2.).unwrap().duration, 2.);
    }
    #[test]
    fn variants_include_selected_settings_without_duplicate_crfs() {
        for crf in [12, 18, 35] {
            let o = Options {
                crf,
                ..Default::default()
            };
            let v = variants(&o);
            assert!((2..=3).contains(&v.len()));
            assert!(v.iter().any(|(_, x)| x == &o));
            let mut seen = std::collections::HashSet::new();
            for (_, x) in v {
                assert!(seen.insert(x.crf));
                assert!(x.validate().is_ok());
            }
        }
        let o = Options {
            target_mb: Some(50.),
            ..Default::default()
        };
        let v = variants(&o);
        assert_eq!(v.len(), 3);
        assert_eq!(v[0].1, o);
        assert!(v[1].1.target_mb.is_none());
    }
    #[test]
    fn clipped_captions_keep_global_png_indices_and_boundary_timing() {
        let v: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/smartcut030.json")).unwrap();
        let mut p = crate::project::parse(&v["cut"].to_string()).unwrap();
        let mut s = p.timeline_segments.take().unwrap();
        s[0].start = 2.;
        s[0].end = 4.;
        p.segments = s;
        let a = caption_intervals(&p, 3., 3.);
        assert_eq!(
            a[0],
            rendering::Interval {
                index: Some(0),
                start: 0.,
                end: 1.
            }
        );
        assert_eq!(
            a[1],
            rendering::Interval {
                index: None,
                start: 1.,
                end: 3.
            }
        );
    }
}
