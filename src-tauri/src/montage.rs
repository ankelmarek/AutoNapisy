//! Bounded sequential render avoids buffering many reordered branches of one input.
use crate::{
    project::Project,
    rendering::Metadata,
    transcription::{run_process, Job},
};
use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};
fn strings(values: &[&str]) -> Vec<OsString> {
    values.iter().map(Into::into).collect()
}
pub fn assemble(
    job: &Arc<Job>,
    ffmpeg: &Path,
    media: &Path,
    dir: &Path,
    p: &Project,
    meta: &Metadata,
) -> Result<PathBuf, String> {
    let clips = p.clips.as_ref().ok_or("Brak montażu")?;
    if clips.is_empty() {
        return Err("Montaż jest pusty".into());
    }
    let mut pieces = Vec::new();
    let mut previous = 0.0;
    for c in clips {
        if c.start > previous + 1e-6 {
            pieces.push((previous, c.start, None));
        }
        pieces.push((c.start, c.end(), Some(c)));
        previous = c.end();
    }
    let mut concat = String::from("ffconcat version 1.0\n");
    for (i, (start, end, clip)) in pieces.iter().enumerate() {
        job.check()?;
        let frames = ((end * 30.0).round() - (start * 30.0).round()) as u64;
        if frames == 0 {
            continue;
        }
        let duration = frames as f64 / 30.0;
        {
            let mut s = job.status.lock().unwrap();
            s.message = format!("Składanie filmu: część {} / {}", i + 1, pieces.len());
            s.progress = None;
        }
        let name = format!("piece-{i:04}.mp4");
        let mut args = strings(&["-nostdin", "-hide_banner", "-loglevel", "error", "-y"]);
        if let Some(c) = clip {
            args.extend(strings(&[
                "-ss",
                &c.source_in.to_string(),
                "-t",
                &(c.source_out - c.source_in).to_string(),
                "-protocol_whitelist",
                "file,pipe",
                "-i",
            ]));
            args.push(media.as_os_str().to_owned());
            if !meta.has_audio {
                args.extend(strings(&[
                    "-f",
                    "lavfi",
                    "-i",
                    "anullsrc=r=48000:cl=stereo",
                ]));
            }
            args.extend(strings(&[
                "-map",
                "0:v:0",
                "-map",
                if meta.has_audio { "0:a:0" } else { "1:a:0" },
                "-vf",
                &format!(
                    "scale={}:{},setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=0.1",
                    meta.width, meta.height
                ),
            ]));
        } else {
            args.extend(strings(&[
                "-f",
                "lavfi",
                "-i",
                &format!(
                    "color=c=black:s={}x{}:r=30:d={duration}",
                    meta.width, meta.height
                ),
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=48000:cl=stereo",
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
            ]));
        }
        args.extend(strings(&[
            "-af",
            &format!("aresample=async=1:first_pts=0,apad,atrim=duration={duration}"),
            "-ac",
            "2",
            "-ar",
            "48000",
            "-c:v",
            "libx264",
            "-crf",
            "16",
            "-preset",
            "fast",
            "-pix_fmt",
            "yuv420p",
            "-video_track_timescale",
            "90000",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-map_metadata",
            "-1",
            "-t",
            &duration.to_string(),
            "-frames:v",
            &frames.to_string(),
            "-progress",
            "pipe:2",
            "-nostats",
            &name,
        ]));
        run_process(job, ffmpeg, &args, false, dir)?;
        concat.push_str(&format!("file '{name}'\nduration {duration:.9}\n"));
    }
    fs::write(dir.join("assembly.ffconcat"), concat).map_err(|e| e.to_string())?;
    {
        let mut s = job.status.lock().unwrap();
        s.message = "Łączenie ujęć…".into();
        s.progress = None;
    }
    run_process(
        job,
        ffmpeg,
        &strings(&[
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-protocol_whitelist",
            "file,pipe",
            "-f",
            "concat",
            "-safe",
            "1",
            "-i",
            "assembly.ffconcat",
            "-c",
            "copy",
            "-map_metadata",
            "-1",
            "assembled.mp4",
        ]),
        false,
        dir,
    )?;
    Ok(dir.join("assembled.mp4"))
}
