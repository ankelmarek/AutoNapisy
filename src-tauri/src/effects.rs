use crate::project::{Clip, Project, Transition};
pub fn effective_clips(p: &Project) -> Vec<Clip> {
    p.clips
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .map(|c| {
            let mut c = c.clone();
            if p.tracks.audio_muted(&c) {
                c.volume = 0.;
            }
            if let Some(t) = p.transitions.iter().find(|t| t.to_id == c.id) {
                c.start = (c.start - t.duration).max(0.0);
                c.source_in = (c.source_in - t.duration).max(0.0);
            }
            c
        })
        .collect()
}
pub fn color_filter(c: &Clip) -> String {
    let Some(a) = &c.adjustments else {
        return String::new();
    };
    let b = a.brightness;
    let k = a.contrast;
    let s = a.saturation;
    // CSS brightness -> contrast -> saturate in sRGB, with bounded numeric arguments only.
    format!("format=rgb24,lutrgb=r='val*{b}':g='val*{b}':b='val*{b}',lutrgb=r='(val-127.5)*{k}+127.5':g='(val-127.5)*{k}+127.5':b='(val-127.5)*{k}+127.5',colorchannelmixer=rr={}:rg={}:rb={}:gr={}:gg={}:gb={}:br={}:bg={}:bb={},",0.213+0.787*s,0.715-0.715*s,0.072-0.072*s,0.213-0.213*s,0.715+0.285*s,0.072-0.072*s,0.213-0.213*s,0.715-0.715*s,0.072+0.928*s)
}
pub fn active_transition<'a>(p: &'a Project, time: f64, track: u8) -> Option<&'a Transition> {
    p.transitions.iter().find(|t| {
        p.clips
            .as_deref()
            .unwrap_or(&[])
            .iter()
            .find(|c| c.id == t.to_id)
            .is_some_and(|c| {
                c.track == track && time >= c.start - t.duration - 1e-7 && time < c.start - 1e-7
            })
    })
}
pub fn audio_gain(p: &Project, c: &Clip, start: f64) -> String {
    for t in &p.transitions {
        let Some(to) = p
            .clips
            .as_deref()
            .unwrap_or(&[])
            .iter()
            .find(|c| c.id == t.to_id)
        else {
            continue;
        };
        if start < to.start - t.duration - 1e-7 || start >= to.start - 1e-7 {
            continue;
        }
        let offset = start - (to.start - t.duration);
        if t.from_id == c.id {
            return format!("{}*max(0,1-(t+{offset})/{})", c.volume, t.duration);
        }
        if t.to_id == c.id {
            return format!("{}*min(1,(t+{offset})/{})", c.volume, t.duration);
        }
    }
    c.volume.to_string()
}

pub const KINDS: &[&str] = &[
    "fade",
    "fadeblack",
    "fadewhite",
    "slideleft",
    "slideright",
    "slideup",
    "slidedown",
    "wipeleft",
    "wiperight",
    "wipeup",
    "wipedown",
    "hblur",
    "pixelize",
    "circleopen",
    "rectcrop",
    "distance",
    "dissolve",
    "zoomin",
    "diagtl",
    "horzopen",
];

pub fn xfade_filter(
    a: &str,
    b: &str,
    kind: &str,
    duration: f64,
    offset: f64,
    length: f64,
) -> Result<String, String> {
    if !KINDS.contains(&kind)
        || !duration.is_finite()
        || !(0.1..=2.0).contains(&duration)
        || !offset.is_finite()
        || offset < -1e-6
        || !length.is_finite()
        || length <= 0.0
    {
        return Err("Nieprawidłowy efekt przejścia".into());
    }
    Ok(format!("[{a}][{b}]xfade=transition={kind}:duration={duration}:offset=0,trim=start={}:duration={length},setpts=PTS-STARTPTS,format=yuv420p[v];",offset.max(0.0)))
}
