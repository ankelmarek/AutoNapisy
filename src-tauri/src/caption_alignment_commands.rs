use crate::{
    caption_alignment,
    commands::{Tasks, ToolState},
    transcription::Job,
    Access,
};
use std::sync::{atomic::Ordering, Arc};
use tauri::State;
fn authorized_fragment(
    json: &str,
    caption_id: &str,
    from: f64,
    to: f64,
    access: &Access,
) -> Result<caption_alignment::Fragment, String> {
    if json.len() > 16 * 1024 * 1024 {
        return Err("Projekt przekracza 16 MB".into());
    }
    let p = crate::project::parse(json)?;
    let mut fragment = caption_alignment::fragment(&p, caption_id, from, to)?;
    let path = crate::media_path(&fragment.path)?;
    if !access
        .0
        .lock()
        .map_err(|_| "Błąd uprawnień")?
        .contains(&path)
    {
        return Err("Najpierw zaimportuj źródło napisu".into());
    }
    fragment.path = path;
    Ok(fragment)
}
#[derive(serde::Serialize)]
pub struct Started {
    id: u64,
    stamp: String,
}
#[tauri::command]
pub fn start_caption_reanalysis(
    json: String,
    caption_id: String,
    from: f64,
    to: f64,
    access: State<'_, Access>,
    tools: State<'_, ToolState>,
    tasks: State<'_, Tasks>,
) -> Result<Started, String> {
    let fragment = authorized_fragment(&json, &caption_id, from, to, &access)?;
    let stamp = caption_alignment::stamp(&fragment.path)?;
    let original_stamp = stamp.clone();
    let tools = tools.0.lock().unwrap().validated()?;
    let mut current = tasks.current.lock().unwrap();
    if current.as_ref().is_some_and(|j| j.active()) {
        return Err("Inna analiza mowy jest w toku".into());
    }
    if let Some(worker) = tasks.worker.lock().unwrap().take() {
        let _ = worker.join();
    }
    let id = tasks.sequence.fetch_add(1, Ordering::SeqCst) + 1;
    let job = Arc::new(Job::new(id));
    *job.deadline.lock().unwrap() =
        Some(std::time::Instant::now() + std::time::Duration::from_secs(600));
    let running = job.clone();
    let worker = std::thread::Builder::new()
        .name("rolvixa-caption-reanalysis".into())
        .spawn(move || {
            let result = (|| {
                if caption_alignment::stamp(&fragment.path)? != original_stamp {
                    return Err("Źródło zmieniło się przed analizą".into());
                }
                caption_alignment::execute(running.clone(), tools, fragment)
            })();
            let mut status = running.status.lock().unwrap();
            if running.cancel.load(Ordering::SeqCst) {
                status.state = "cancelled".into();
                status.message = "Anulowano dopasowanie. Projekt bez zmian.".into();
            } else {
                match result {
                    Ok((segments, duration)) => {
                        status.state = "completed".into();
                        status.message = "Propozycja gotowa. Porównaj treść i odsłuchaj.".into();
                        status.segments = Some(segments);
                        status.audio_duration = Some(duration);
                    }
                    Err(e) => {
                        status.state = "failed".into();
                        status.message = e;
                    }
                }
            }
            status.progress = None;
        })
        .map_err(|e| e.to_string())?;
    *tasks.worker.lock().unwrap() = Some(worker);
    *current = Some(job);
    Ok(Started { id, stamp })
}
#[tauri::command]
pub fn validate_caption_reanalysis(
    json: String,
    caption_id: String,
    from: f64,
    to: f64,
    stamp: String,
    access: State<'_, Access>,
) -> Result<(), String> {
    let f = authorized_fragment(&json, &caption_id, from, to, &access)?;
    if caption_alignment::stamp(&f.path)? != stamp {
        return Err("Plik zmienił się po analizie. Uruchom dopasowanie ponownie".into());
    }
    Ok(())
}
