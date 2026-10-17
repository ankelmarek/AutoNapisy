//! Controlled MLT XML timeline adapter. No project-supplied XML, plugins or shell arguments.
use crate::{
    project::{Clip, Project},
    rendering::Metadata,
    transcription::{run_process, Job},
};
use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};
pub const FPS: f64 = 30.0;
pub fn frame(t: f64) -> i64 {
    (t * FPS).round().max(0.0) as i64
}
fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
fn prop(key: &str, value: impl ToString) -> String {
    format!(
        "<property name=\"{}\">{}</property>",
        esc(key),
        esc(&value.to_string())
    )
}
fn filter(
    service: &str,
    values: &[(&str, String)],
    start: Option<i64>,
    end: Option<i64>,
) -> String {
    let mut s = format!(
        "<filter{}{}>",
        start.map(|v| format!(" in=\"{v}\"")).unwrap_or_default(),
        end.map(|v| format!(" out=\"{v}\"")).unwrap_or_default()
    );
    s += &prop("mlt_service", service);
    for (k, v) in values {
        s += &prop(k, v);
    }
    s += "</filter>";
    s
}
pub fn configure(command: &mut std::process::Command, program: &Path) {
    if ![Some("melt"), Some("melt.exe")].contains(&program.file_name().and_then(|s| s.to_str())) {
        return;
    }
    command
        .env("QT_QPA_PLATFORM", "offscreen")
        .env("MLT_NO_VDPAU", "1")
        .env("LC_NUMERIC", "C");
    if let Some(root) = program.parent() {
        if root.join("lib/mlt").is_dir() {
            command
                .env("MLT_REPOSITORY", root.join("lib/mlt"))
                .env("MLT_DATA", root.join("share/mlt"))
                .env("MLT_PROFILES_PATH", root.join("share/mlt/profiles"));
        }
    }
}
pub fn executable(resource: &Path) -> Result<PathBuf, String> {
    let p = resource.join("vendor/mlt/melt.exe");
    if p.is_file() {
        return Ok(p);
    }
    #[cfg(debug_assertions)]
    if let Some(p) = std::env::var_os("ROLVIXA_MLT") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Ok(p);
        }
    }
    Err("Brakuje silnika MLT. Zainstaluj pełną wersję RolVixa.".into())
}
/// Explicit independent playlists preserve gaps and all linked/independent sound.
pub fn xml(
    p: &Project,
    meta: &Metadata,
    overlays: &[(String, PathBuf)],
    ranges: Option<&[(i64, i64)]>,
) -> Result<String, String> {
    let clips = crate::effects::effective_clips(p);
    let total = frame(crate::project::composition_duration(p)).max(1);
    let last = total - 1;
    let mut s=format!("<?xml version=\"1.0\" encoding=\"utf-8\"?><mlt producer=\"output\"><profile description=\"RolVixa\" width=\"{}\" height=\"{}\" frame_rate_num=\"30\" frame_rate_den=\"1\" progressive=\"1\" sample_aspect_num=\"1\" sample_aspect_den=\"1\" display_aspect_num=\"{}\" display_aspect_den=\"{}\" colorspace=\"709\"/>",meta.width,meta.height,meta.width,meta.height);
    s+=&format!("<producer id=\"black\" in=\"0\" out=\"{last}\">{}{}{}<property name=\"length\">{total}</property></producer><playlist id=\"base\"><entry producer=\"black\" in=\"0\" out=\"{last}\"/></playlist>",prop("mlt_service","color"),prop("resource","0x000000ff"),prop("set.test_audio",1));
    let mut tracks: Vec<(String, bool)> = vec![];
    for lane in 0..2 {
        for c in clips
            .iter()
            .filter(|c| c.kind == "video" && c.track == lane)
        {
            let mut audio = c.clone();
            if ranges.is_some() {
                audio.kind = "audio".into();
            }
            append_clip(&mut s, p, &audio, &mut tracks, total)?;
        }
        for (id, path) in overlays {
            let t = p
                .transitions
                .iter()
                .find(|t| &t.id == id)
                .ok_or("Brak przejścia MLT")?;
            let to = clips
                .iter()
                .find(|c| c.id == t.to_id)
                .ok_or("Brak klipu przejścia")?;
            if to.track != lane {
                continue;
            }
            let n = tracks.len();
            let length = frame(t.duration).max(1);
            let start = frame(to.start);
            s += &format!(
                "<producer id=\"clip{n}\">{}{}{}{}</producer>",
                prop("mlt_service", "avformat"),
                prop("resource", path.to_string_lossy()),
                prop("audio_index", -1),
                prop("set.test_audio", 1)
            );
            s+=&format!("<playlist id=\"track{n}\">{}<entry producer=\"clip{n}\" in=\"0\" out=\"{}\"/></playlist>",if start>0{format!("<blank length=\"{start}\"/>")}else{String::new()},length-1);
            tracks.push((format!("track{n}"), true));
        }
    }
    for c in clips.iter().filter(|c| c.kind == "audio") {
        let mut audio = c.clone();
        if ranges.is_some() {
            audio.kind = "audio".into();
        }
        append_clip(&mut s, p, &audio, &mut tracks, total)?;
    }
    s += &format!("<tractor id=\"timeline\" in=\"0\" out=\"{last}\"><track producer=\"base\"/>");
    for (id, visual_only) in &tracks {
        s += &format!(
            "<track producer=\"{}\"{}/>",
            id,
            if *visual_only { " hide=\"audio\"" } else { "" }
        );
    }
    for (i, _) in tracks.iter().enumerate() {
        let b = i + 1;
        s += &format!(
            "<transition in=\"0\" out=\"{last}\">{}{}{}{}{}{}</transition>",
            prop("mlt_service", "mix"),
            prop("a_track", 0),
            prop("b_track", b),
            prop("always_active", 1),
            prop("sum", 1),
            prop("combine", 0)
        );
        s += &format!(
            "<transition in=\"0\" out=\"{last}\">{}{}{}{}{}{}</transition>",
            prop("mlt_service", "composite"),
            prop("a_track", 0),
            prop("b_track", b),
            prop("always_active", 1),
            prop("progressive", 1),
            prop("geometry", "0=0/0:100%x100%:100")
        );
    }
    s += "</tractor>";
    if let Some(ranges) = ranges {
        s += "<playlist id=\"output\">";
        for (start, end) in ranges {
            if end > start {
                s += &format!(
                    "<entry producer=\"timeline\" in=\"{start}\" out=\"{}\"/>",
                    end - 1
                );
            }
        }
        s += "</playlist>";
    } else {
        s+=&format!("<tractor id=\"output\" in=\"0\" out=\"{last}\"><track producer=\"timeline\"/></tractor>");
    }
    s += "</mlt>";
    Ok(s)
}
fn append_clip(
    s: &mut String,
    p: &Project,
    c: &Clip,
    tracks: &mut Vec<(String, bool)>,
    _total: i64,
) -> Result<(), String> {
    let n = tracks.len();
    let input = frame(c.source_in);
    let count = (frame(c.end()) - frame(c.start)).max(1);
    let out = input + count - 1;
    let start = frame(c.start);
    *s += &format!(
        "<producer id=\"clip{n}\" in=\"0\" out=\"{out}\">{}{}{}",
        prop("mlt_service", "avformat"),
        prop("resource", p.clip_path(c).ok_or("Brak źródła MLT")?),
        prop("eof", "pause")
    );
    if c.kind == "audio" {
        *s += &prop("set.test_image", 1);
        *s += &prop("video_index", -1);
    }
    if let Some(a) = &c.adjustments {
        for expr in [
            format!("val*{}", a.brightness),
            format!("(val-127.5)*{}+127.5", a.contrast),
        ] {
            *s += &filter(
                "avfilter.lutrgb",
                &[
                    ("av.r", expr.clone()),
                    ("av.g", expr.clone()),
                    ("av.b", expr),
                ],
                None,
                None,
            );
        }
        let v = a.saturation;
        *s += &filter(
            "avfilter.colorchannelmixer",
            &[
                ("av.rr", (0.213 + 0.787 * v).to_string()),
                ("av.rg", (0.715 - 0.715 * v).to_string()),
                ("av.rb", (0.072 - 0.072 * v).to_string()),
                ("av.gr", (0.213 - 0.213 * v).to_string()),
                ("av.gg", (0.715 + 0.285 * v).to_string()),
                ("av.gb", (0.072 - 0.072 * v).to_string()),
                ("av.br", (0.213 - 0.213 * v).to_string()),
                ("av.bg", (0.715 - 0.715 * v).to_string()),
                ("av.bb", (0.072 + 0.928 * v).to_string()),
            ],
            None,
            None,
        );
    }
    let volume = if c.volume > 0.0 {
        20.0 * c.volume.log10()
    } else {
        -100.0
    };
    *s += &filter("volume", &[("level", volume.to_string())], None, None);
    for t in &p.transitions {
        let incoming = t.to_id == c.id;
        let outgoing = t.from_id == c.id;
        if !incoming && !outgoing {
            continue;
        }
        let length = frame(t.duration).max(2);
        let begin = if incoming { input } else { out - length + 1 };
        let mut keys = vec![];
        for f in 0..length {
            let progress = f as f64 / (length - 1) as f64;
            let gain = if incoming { progress } else { 1.0 - progress };
            let db = if gain > 0.00001 {
                20.0 * gain.log10()
            } else {
                -100.0
            };
            keys.push(format!("{f}={db}"));
        }
        *s += &filter(
            "volume",
            &[("level", keys.join(";"))],
            Some(begin),
            Some(begin + length - 1),
        );
    }
    *s += "</producer>";
    *s+=&format!("<playlist id=\"track{n}\">{}<entry producer=\"clip{n}\" in=\"{input}\" out=\"{out}\"/></playlist>",if start>0{format!("<blank length=\"{start}\"/>")}else{String::new()});
    tracks.push((format!("track{n}"), false));
    Ok(())
}
pub fn prepare(
    job: &Arc<Job>,
    ffmpeg: &Path,
    p: &Project,
    meta: &Metadata,
    dir: &Path,
    preview: bool,
) -> Result<PathBuf, String> {
    let mut overlays = vec![];
    for (i, t) in p.transitions.iter().enumerate() {
        job.check()?;
        let folder = dir.join(format!("transition-{i}"));
        fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
        let path = crate::transition_preview::render_sized(
            job,
            ffmpeg,
            p,
            t,
            &folder,
            if preview { Some(540) } else { None },
        )?;
        overlays.push((t.id.clone(), path));
    }
    let path = dir.join("timeline.mlt");
    fs::write(&path, xml(p, meta, &overlays, None)?).map_err(|e| e.to_string())?;
    Ok(path)
}
pub fn run(
    job: &Arc<Job>,
    melt: &Path,
    dir: &Path,
    from: i64,
    last: i64,
    preview: bool,
    audio: bool,
) -> Result<PathBuf, String> {
    let output = if audio {
        "audio.wav"
    } else if preview {
        "preview.mp4"
    } else {
        "assembled-mlt.mp4"
    };
    let mut args: Vec<OsString> = vec![
        "timeline.mlt".into(),
        format!("in={from}").into(),
        format!("out={last}").into(),
        "-consumer".into(),
        format!("avformat:{output}").into(),
        "real_time=-2".into(),
        "terminate_on_pause=1".into(),
        "threads=2".into(),
    ];
    if audio {
        for v in ["vn=1", "acodec=pcm_s16le", "ar=16000", "ac=1"] {
            args.push(v.into());
        }
    } else {
        for v in [
            "vcodec=libx264",
            "acodec=aac",
            "pix_fmt=yuv420p",
            "ar=48000",
            "ac=2",
            "ab=192k",
            "progressive=1",
            "g=15",
            "bf=0",
        ] {
            args.push(v.into());
        }
        args.push(
            if preview {
                "preset=ultrafast"
            } else {
                "preset=fast"
            }
            .into(),
        );
        args.push(if preview { "crf=23" } else { "crf=16" }.into());
        if preview {
            for v in [
                "f=mp4",
                "movflags=frag_keyframe+empty_moov+default_base_moof",
                "frag_duration=300000",
                "flush_packets=1",
            ] {
                args.push(v.into());
            }
        }
    }
    run_process(job, melt, &args, false, dir)?;
    Ok(dir.join(output))
}
pub fn assemble(
    job: &Arc<Job>,
    melt: &Path,
    ffmpeg: &Path,
    p: &Project,
    meta: &Metadata,
    dir: &Path,
) -> Result<PathBuf, String> {
    prepare(job, ffmpeg, p, meta, dir, false)?;
    run(
        job,
        melt,
        dir,
        0,
        frame(crate::project::composition_duration(p)) - 1,
        false,
        false,
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn xml_escaping_and_timebase() {
        assert_eq!(esc("Łódź & <a>\""), "Łódź &amp; &lt;a&gt;&quot;");
        assert_eq!(frame(0.5), 15);
    }
}
