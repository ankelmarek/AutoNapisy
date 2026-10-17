use crate::{
    commands::ToolState,
    media_path,
    transcription::{validate_tool, Job},
    waveform::{self, Peaks},
    Access,
};
use base64::Engine;
use std::{
    path::Path,
    sync::{Arc, Mutex},
};
use tauri::State;
#[derive(Default)]
pub struct AnalysisState {
    frame_job: Mutex<Option<Arc<Job>>>,
    frame_gate: Arc<Mutex<()>>,
    jobs: Arc<Mutex<Vec<Arc<Job>>>>,
    gate: Arc<Mutex<()>>,
}
impl AnalysisState {
    pub fn shutdown(&self) {
        for job in self.jobs.lock().unwrap().iter() {
            job.cancel();
        }
    }
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerFrame {
    id: String,
    png: String,
    source_aspect: f64,
}
#[derive(serde::Serialize)]
pub struct LayerFrames {
    width: u32,
    height: u32,
    layers: Vec<LayerFrame>,
}
#[tauri::command]
pub async fn layer_frames(
    json: String,
    time: f64,
    access: State<'_, Access>,
    tools: State<'_, ToolState>,
    analysis: State<'_, AnalysisState>,
    proxies: State<'_, crate::proxy_commands::ProxyState>,
) -> Result<LayerFrames, String> {
    let p = crate::mlt_commands::authorized(&json, &access)?;
    if !time.is_finite() || time < 0. || time > 86400. {
        return Err("Nieprawidłowa pozycja podglądu".into());
    }
    let ffmpeg = {
        let t = tools.0.lock().unwrap();
        validate_tool("ffmpeg", t.ffmpeg.as_deref().ok_or("Wskaż FFmpeg")?)?
    };
    let job = Arc::new(Job::new(0));
    if let Some(old) = analysis.frame_job.lock().unwrap().replace(job.clone()) {
        old.cancel();
    }
    {
        let mut jobs = analysis.jobs.lock().unwrap();
        jobs.retain(|j| j.active());
        if jobs.len() > 32 {
            return Err("Podgląd jest zajęty".into());
        }
        jobs.push(job.clone());
    }
    let gate = analysis.frame_gate.clone();
    let proxies = proxies.view();
    tauri::async_runtime::spawn_blocking(move||{
      let result=(||{
       let _guard=gate.lock().map_err(|_|"Błąd kolejki podglądu")?;
       job.check()?;
       let _proxy_lease=proxies.lease.read().map_err(|_|"Błąd cache proxy")?;
       let dir=tempfile::tempdir().map_err(|e|e.to_string())?;
       let mut meta=if let Some(m)=&p.media{crate::rendering::inspect(&job,&ffmpeg,Path::new(&m.path),dir.path())?}else{crate::rendering::Metadata{width:1280,height:720,duration:1.,has_audio:false}};
       crate::framing::apply_canvas(&p,&mut meta);
       let original=p.clone();let p=proxies.project(&p);
       let scale=(540./meta.width.max(meta.height) as f64).min(1.);
       let width=((meta.width as f64*scale/2.).round() as u32*2).max(2);let height=((meta.height as f64*scale/2.).round() as u32*2).max(2);
       if (0..2).any(|track|crate::effects::active_transition(&p,time,track).is_some()){return Err("Ustaw głowicę poza przejściem, aby kadrować film".into());}
       let mut layers=vec![];
       for c in crate::effects::effective_clips(&p).iter().filter(|c|c.kind=="video"&&c.start<=time&&time<c.end()&&!p.tracks.video_hidden(c)){
        let path=Path::new(p.clip_path(c).ok_or("Brak filmu warstwy")?);
        let source=crate::rendering::inspect(&job,&ffmpeg,Path::new(original.clip_path(c).ok_or("Brak źródła")?),dir.path())?;
        let output=dir.path().join(format!("frame-{}.png",layers.len()));
        let filter=format!("{}scale={width}:{height}:force_original_aspect_ratio=decrease,format=rgba,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1",crate::effects::color_filter(c));
        let mut args:Vec<std::ffi::OsString>=["-v","error","-nostdin","-y","-ss",&(c.source_in+time-c.start).to_string(),"-protocol_whitelist","file,pipe","-i"].iter().map(Into::into).collect();args.push(path.as_os_str().to_owned());
        args.extend(["-frames:v","1","-vf",&filter,"-threads","1"].iter().map(std::ffi::OsString::from));args.push(output.clone().into_os_string());
        crate::transcription::run_process(&job,&ffmpeg,&args,false,dir.path())?;
        let data=std::fs::read(output).map_err(|e|e.to_string())?;if data.len()>8*1024*1024{return Err("Klatka podglądu jest zbyt duża".into());}
        layers.push(LayerFrame{id:c.id.clone(),png:base64::engine::general_purpose::STANDARD.encode(data),source_aspect:source.width as f64/source.height as f64});
       }
       Ok(LayerFrames{width,height,layers})
      })();job.status.lock().unwrap().state=if result.is_ok(){"completed"}else{"failed"}.into();result
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn audio_waveform(
    path: String,
    duration: f64,
    access: State<'_, Access>,
    tools: State<'_, ToolState>,
    analysis: State<'_, AnalysisState>,
) -> Result<Peaks, String> {
    let path = media_path(Path::new(&path))?;
    if !access
        .0
        .lock()
        .map_err(|_| "Błąd uprawnień")?
        .contains(&path)
    {
        return Err("Najpierw zaimportuj plik lub jego projekt".into());
    }
    if !duration.is_finite() || !(0.05..=86400.0).contains(&duration) {
        return Err("Nieprawidłowy czas".into());
    }
    let ffmpeg = {
        let settings = tools.0.lock().unwrap();
        validate_tool("ffmpeg", settings.ffmpeg.as_deref().ok_or("Wskaż FFmpeg")?)?
    };
    let job = Arc::new(Job::new(0));
    {
        let mut jobs = analysis.jobs.lock().unwrap();
        jobs.retain(|j| j.active());
        if jobs.len() >= 100 {
            return Err("Zbyt wiele analiz audio".into());
        }
        jobs.push(job.clone());
    }
    let gate = analysis.gate.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = gate.lock().map_err(|_| "Błąd kolejki audio")?;
        job.check()?;
        let result = waveform::analyze(&job, &ffmpeg, &path, duration);
        job.status.lock().unwrap().state = if result.is_ok() {
            "completed"
        } else {
            "failed"
        }
        .into();
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn media_info(
    path: String,
    kind: String,
    access: State<'_, Access>,
    tools: State<'_, ToolState>,
    analysis: State<'_, AnalysisState>,
) -> Result<crate::rendering::Metadata, String> {
    let path = media_path(Path::new(&path))?;
    if !access
        .0
        .lock()
        .map_err(|_| "Błąd uprawnień")?
        .contains(&path)
    {
        return Err("Najpierw zaimportuj plik".into());
    }
    if !["video", "audio"].contains(&kind.as_str()) {
        return Err("Nieprawidłowy rodzaj pliku".into());
    }
    let ffmpeg = {
        let t = tools.0.lock().unwrap();
        validate_tool("ffmpeg", t.ffmpeg.as_deref().ok_or("Wskaż FFmpeg")?)?
    };
    let job = Arc::new(Job::new(0));
    {
        let mut jobs = analysis.jobs.lock().unwrap();
        jobs.retain(|j| j.active());
        jobs.push(job.clone());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
            if kind == "video" {
                return crate::rendering::inspect(&job, &ffmpeg, &path, dir.path());
            }
            let capture = dir.path().join("audio.json");
            let mut args: Vec<std::ffi::OsString> = [
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-show_entries",
                "format=duration:stream=codec_type",
                "-of",
                "json",
            ]
            .iter()
            .map(Into::into)
            .collect();
            args.push(path.into_os_string());
            crate::transcription::run_process_capture(
                &job,
                &crate::rendering::ffprobe_path(&ffmpeg)?,
                &args,
                false,
                dir.path(),
                Some(&capture),
            )?;
            let raw = std::fs::read(capture).map_err(|e| e.to_string())?;
            if raw.len() > 65536 {
                return Err("Zbyt obszerny wynik FFprobe".into());
            }
            let v: serde_json::Value = serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
            let duration = v["format"]["duration"]
                .as_str()
                .and_then(|s| s.parse::<f64>().ok())
                .ok_or("Brak czasu audio")?;
            if !duration.is_finite() || !(0.05..=86400.0).contains(&duration) {
                return Err("Nieprawidłowy czas audio".into());
            }
            Ok(crate::rendering::Metadata {
                width: 1280,
                height: 720,
                duration,
                has_audio: true,
            })
        })();
        job.status.lock().unwrap().state = if result.is_ok() {
            "completed"
        } else {
            "failed"
        }
        .into();
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
