//! Cached, bounded FFmpeg previews use the very same xfade filter as export.
use crate::{
    project::{Project, Transition},
    rendering::inspect,
    transcription::{run_process, Job},
};
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    sync::Arc,
};
pub fn render(
    job: &Arc<Job>,
    ffmpeg: &Path,
    p: &Project,
    t: &Transition,
    dir: &Path,
) -> Result<PathBuf, String> {
    render_sized(job, ffmpeg, p, t, dir, Some(540))
}
pub fn render_sized(
    job: &Arc<Job>,
    ffmpeg: &Path,
    p: &Project,
    t: &Transition,
    dir: &Path,
    max_size: Option<u32>,
) -> Result<PathBuf, String> {
    let clips = p.clips.as_deref().ok_or("Brak montażu")?;
    let a = clips
        .iter()
        .find(|c| c.id == t.from_id)
        .ok_or("Brak klipu")?;
    let b = clips.iter().find(|c| c.id == t.to_id).ok_or("Brak klipu")?;
    let mut meta = inspect(
        job,
        ffmpeg,
        Path::new(&p.media.as_ref().ok_or("Brak filmu")?.path),
        dir,
    )?;
    crate::framing::apply_canvas(p, &mut meta);
    let scale = max_size
        .map(|v| (v as f64 / meta.width.max(meta.height) as f64).min(1.0))
        .unwrap_or(1.0);
    let width = ((meta.width as f64 * scale / 2.0).round() as u32 * 2).max(2);
    let height = ((meta.height as f64 * scale / 2.0).round() as u32 * 2).max(2);
    let mut args: Vec<OsString> = [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-filter_complex_threads",
        "1",
    ]
    .iter()
    .map(Into::into)
    .collect();
    let mut filter = String::new();
    for (i, c) in [a, b].iter().enumerate() {
        let source = if i == 0 {
            c.source_out - t.duration
        } else {
            c.source_in - t.duration
        };
        for arg in [
            "-ss".to_string(),
            source.max(0.0).to_string(),
            "-t".into(),
            (t.duration + 0.15).to_string(),
            "-protocol_whitelist".into(),
            "file,pipe".into(),
            "-i".into(),
        ] {
            args.push(arg.into());
        }
        args.push(p.clip_path(c).ok_or("Brak źródła")?.into());
        filter.push_str(&format!("[{i}:v:0]setpts=PTS-STARTPTS,{}fps=30,settb=AVTB,tpad=stop_mode=clone:stop_duration=0.15[v{i}source];",crate::effects::color_filter(c)));
        filter.push_str(&crate::framing::ffmpeg_chain(
            c,
            width,
            height,
            &format!("v{i}source"),
            &format!("v{i}"),
        ));
    }
    filter.push_str(&crate::effects::xfade_filter(
        "v0", "v1", &t.kind, t.duration, 0.0, t.duration,
    )?);
    for arg in [
        "-filter_complex",
        &filter,
        "-map",
        "[v]",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-threads",
        "2",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-t",
        &t.duration.to_string(),
    ] {
        args.push(arg.into());
    }
    let output = dir.join("transition.mp4");
    args.push(output.clone().into_os_string());
    run_process(job, ffmpeg, &args, false, dir)?;
    Ok(output)
}
