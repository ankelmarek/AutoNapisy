//! The shared source-time gain model for MLT, FFmpeg export and transcription.
use crate::project::Clip;
pub fn validate(c: &Clip, duration: f64) -> Result<(), String> {
    for (f, incoming) in c
        .crossfade
        .iter()
        .flat_map(|x| [(&x.fade_in, true), (&x.fade_out, false)])
    {
        if let Some(f) = f {
            if !f.anchor.is_finite()
                || !f.duration.is_finite()
                || f.duration <= 0.
                || f.duration > 86400.
                || f.anchor < 0.
                || f.anchor > duration + 1e-6
                || (incoming && f.anchor + f.duration > duration + 1e-6)
                || (!incoming && f.anchor - f.duration < -1e-6)
            {
                return Err("Nieprawidłowa obwiednia przejścia audio".into());
            }
        }
    }
    let Some(a) = &c.audio else { return Ok(()) };
    let mut ids = std::collections::HashSet::new();
    if a.points.len() > 64
        || a.points.iter().enumerate().any(|(i, p)| {
            p.id.is_empty()
                || p.id.chars().count() > 100
                || !ids.insert(&p.id)
                || !p.time.is_finite()
                || p.time < 0.
                || p.time > duration + 1e-6
                || !p.gain.is_finite()
                || !(0. ..=1.).contains(&p.gain)
                || (i > 0 && p.time - a.points[i - 1].time < 0.000999)
        })
    {
        return Err("Nieprawidłowe punkty głośności".into());
    }
    for (f, incoming) in [(&a.fade_in, true), (&a.fade_out, false)] {
        if let Some(f) = f {
            if !f.anchor.is_finite()
                || !f.duration.is_finite()
                || f.duration <= 0.
                || f.duration > 86400.
                || f.anchor < 0.
                || f.anchor > duration + 1e-6
                || (incoming && f.anchor + f.duration > duration + 1e-6)
                || (!incoming && f.anchor - f.duration < -1e-6)
            {
                return Err("Nieprawidłowe czasy fade audio".into());
            }
        }
    }
    Ok(())
}
pub fn smooth(x: f64) -> f64 {
    let x = x.clamp(0., 1.);
    x * x * (3. - 2. * x)
}
pub fn gain(c: &Clip, t: f64) -> f64 {
    let base = if c.audio_detached { 0. } else { c.volume }
        * c.crossfade.as_ref().map_or(1., |x| {
            x.fade_in
                .as_ref()
                .map_or(1., |f| ((t - f.anchor) / f.duration).clamp(0., 1.))
                * x.fade_out
                    .as_ref()
                    .map_or(1., |f| ((f.anchor - t) / f.duration).clamp(0., 1.))
        });
    let Some(a) = &c.audio else { return base };
    let points = &a.points;
    let env = if points.is_empty() {
        1.
    } else {
        let mut g = points[0].gain;
        for p in points.windows(2) {
            g +=
                (p[1].gain - p[0].gain) * ((t - p[0].time) / (p[1].time - p[0].time)).clamp(0., 1.);
        }
        g.clamp(0., 1.)
    };
    base * env
        * a.fade_in
            .as_ref()
            .map_or(1., |f| smooth((t - f.anchor) / f.duration))
        * a.fade_out
            .as_ref()
            .map_or(1., |f| smooth((f.anchor - t) / f.duration))
}
fn smooth_expr(x: String) -> String {
    format!("pow({x},2)*(3-2*{x})")
}
/// `time` is controlled adapter code, never user text; all inserted values passed validation.
pub fn expression(c: &Clip, time: &str) -> String {
    let mut factors = vec![if c.audio_detached {
        "0".into()
    } else {
        c.volume.to_string()
    }];
    if let Some(x) = &c.crossfade {
        if let Some(f) = &x.fade_in {
            factors.push(format!("clip((({time})-{})/{},0,1)", f.anchor, f.duration));
        }
        if let Some(f) = &x.fade_out {
            factors.push(format!("clip(({}-({time}))/{},0,1)", f.anchor, f.duration));
        }
    }
    let empty = crate::project::AudioEnvelope::default();
    let a = c.audio.as_ref().unwrap_or(&empty);
    if let Some(first) = a.points.first() {
        let mut env = first.gain.to_string();
        for pair in a.points.windows(2) {
            let delta = pair[1].gain - pair[0].gain;
            env += &format!(
                "+({delta})*clip((({time})-{})/{},0,1)",
                pair[0].time,
                pair[1].time - pair[0].time
            );
        }
        factors.push(format!("clip({env},0,1)"));
    }
    if let Some(f) = &a.fade_in {
        factors.push(smooth_expr(format!(
            "clip((({time})-{})/{},0,1)",
            f.anchor, f.duration
        )));
    }
    if let Some(f) = &a.fade_out {
        factors.push(smooth_expr(format!(
            "clip(({}-({time}))/{},0,1)",
            f.anchor, f.duration
        )));
    }
    factors
        .into_iter()
        .map(|f| format!("({f})"))
        .collect::<Vec<_>>()
        .join("*")
}

fn db(gain: f64) -> f64 {
    if gain > 0.00001 {
        20. * gain.log10()
    } else {
        -100.
    }
}
/// MLT's native volume filter interpolates dB keyframes. Subdivide until its gain
/// differs by <=0.001, stopping at the editor's 30 fps timebase. This bounds XML
/// size by curve complexity instead of creating millions of keys for long clips.
pub fn mlt_level(c: &Clip, count: i64) -> String {
    if c.audio.is_none() && c.crossfade.is_none() {
        return db(gain(c, c.source_in)).to_string();
    }
    let last = (count - 1).max(0);
    let sample = |f: i64| gain(c, c.source_in + f as f64 / 30.);
    let mut bounds = vec![0, last];
    let empty = crate::project::AudioEnvelope::default();
    let a = c.audio.as_ref().unwrap_or(&empty);
    for p in &a.points {
        bounds.push(
            ((p.time - c.source_in) * 30.)
                .round()
                .clamp(0., last as f64) as i64,
        );
    }
    for (fade, incoming) in [(&a.fade_in, true), (&a.fade_out, false)]
        .into_iter()
        .chain(
            c.crossfade
                .iter()
                .flat_map(|x| [(&x.fade_in, true), (&x.fade_out, false)]),
        )
    {
        if let Some(f) = fade {
            for t in [
                f.anchor,
                f.anchor + if incoming { f.duration } else { -f.duration },
            ] {
                bounds.push(((t - c.source_in) * 30.).round().clamp(0., last as f64) as i64);
            }
        }
    }
    bounds.sort_unstable();
    bounds.dedup();
    fn split<F: Fn(i64) -> f64>(lo: i64, hi: i64, sample: &F, keys: &mut Vec<i64>) {
        if hi - lo <= 1 {
            keys.push(hi);
            return;
        }
        let a = db(sample(lo));
        let b = db(sample(hi));
        let bad = [
            lo + (hi - lo) / 4,
            lo + (hi - lo) / 2,
            lo + 3 * (hi - lo) / 4,
        ]
        .into_iter()
        .any(|f| {
            let t = (f - lo) as f64 / (hi - lo) as f64;
            let approx = 10f64.powf((a + (b - a) * t) / 20.);
            (approx - sample(f)).abs() > 0.001
        });
        if bad {
            let mid = lo + (hi - lo) / 2;
            split(lo, mid, sample, keys);
            split(mid, hi, sample, keys);
        } else {
            keys.push(hi);
        }
    }
    let mut keys = vec![0];
    for p in bounds.windows(2) {
        split(p[0], p[1], &sample, &mut keys);
    }
    keys.into_iter()
        .map(|f| format!("{f}={}", db(sample(f))))
        .collect::<Vec<_>>()
        .join(";")
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::{AudioEnvelope, Fade, VolumePoint};
    fn clip() -> Clip {
        Clip {
            volume: 0.8,
            source_in: 2.,
            source_out: 8.,
            audio: Some(AudioEnvelope {
                fade_in: Some(Fade {
                    anchor: 2.,
                    duration: 2.,
                }),
                fade_out: Some(Fade {
                    anchor: 8.,
                    duration: 2.,
                }),
                points: vec![
                    VolumePoint {
                        id: "a".into(),
                        time: 2.,
                        gain: 1.,
                    },
                    VolumePoint {
                        id: "b".into(),
                        time: 6.,
                        gain: 0.5,
                    },
                ],
            }),
            ..Default::default()
        }
    }
    #[test]
    fn multiplicative_linear_and_smooth() {
        let c = clip();
        assert_eq!(gain(&c, 2.), 0.);
        assert!((gain(&c, 3.) - 0.35).abs() < 1e-9);
        assert!((gain(&c, 6.) - 0.4).abs() < 1e-9);
        assert!((gain(&c, 7.) - 0.2).abs() < 1e-9);
        assert_eq!(gain(&c, 8.), 0.);
        let mut muted = c.clone();
        muted.volume = 0.;
        assert_eq!(gain(&muted, 4.), 0.);
    }
    #[test]
    fn hidden_points_survive_trim_and_split() {
        let c = clip();
        let mut cut = c.clone();
        cut.source_in = 3.;
        cut.source_out = 4.;
        assert!(validate(&cut, 10.).is_ok());
        assert_eq!(gain(&c, 3.2), gain(&cut, 3.2));
    }
    #[test]
    fn rejects_invalid_points_and_fades() {
        let mut c = clip();
        c.audio.as_mut().unwrap().points[1].time = 1.;
        assert!(validate(&c, 10.).is_err());
        c = clip();
        c.audio
            .as_mut()
            .unwrap()
            .fade_out
            .as_mut()
            .unwrap()
            .duration = 9.;
        assert!(validate(&c, 10.).is_err());
    }
    #[test]
    fn adaptive_keys_are_bounded_for_a_day_and_match_linear_gain() {
        let mut c = clip();
        c.source_in = 0.;
        c.source_out = 86400.;
        let a = c.audio.as_mut().unwrap();
        a.fade_in = Some(Fade {
            anchor: 0.,
            duration: 86400.,
        });
        a.fade_out = Some(Fade {
            anchor: 86400.,
            duration: 86400.,
        });
        a.points = vec![
            VolumePoint {
                id: "a".into(),
                time: 0.,
                gain: 1.,
            },
            VolumePoint {
                id: "b".into(),
                time: 43200.,
                gain: 0.1,
            },
            VolumePoint {
                id: "c".into(),
                time: 86400.,
                gain: 1.,
            },
        ];
        let count = 2592000;
        let raw = mlt_level(&c, count);
        assert!(raw.len() < 30000, "{} bytes", raw.len());
        let keys: Vec<(i64, f64)> = raw
            .split(';')
            .map(|s| {
                let (f, v) = s.split_once('=').unwrap();
                (f.parse().unwrap(), v.parse().unwrap())
            })
            .collect();
        for i in 0..1000 {
            let f = i * (count - 1) / 999;
            let pair = keys
                .windows(2)
                .find(|p| f >= p[0].0 && f <= p[1].0)
                .unwrap();
            let t = (f - pair[0].0) as f64 / (pair[1].0 - pair[0].0) as f64;
            let rendered = 10f64.powf((pair[0].1 + (pair[1].1 - pair[0].1) * t) / 20.);
            assert!((rendered - gain(&c, f as f64 / 30.)).abs() < 0.0015);
        }
    }
}
