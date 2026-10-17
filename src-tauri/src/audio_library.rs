//! Audio metadata and validation shared by the library and controlled native commands.
use crate::{
    project::Provenance,
    rendering::ffprobe_path,
    transcription::{run_process_capture, Job},
};
use serde::{Deserialize, Serialize};
use std::{path::Path, sync::Arc};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub duration: f64,
    pub group: String,
    pub provenance: Provenance,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAudio {
    pub id: String,
    pub title: String,
    pub creator: String,
    pub duration: f64,
    pub license: String,
    pub license_url: String,
    pub source_url: String,
    pub attribution: String,
    #[serde(skip_serializing)]
    pub url: String,
    #[serde(skip_serializing)]
    pub extension: String,
}
#[derive(Deserialize)]
struct RawAudio {
    id: String,
    title: Option<String>,
    creator: Option<String>,
    duration: Option<f64>,
    license: String,
    license_url: Option<String>,
    foreign_landing_url: Option<String>,
    attribution: Option<String>,
    url: Option<String>,
    filetype: Option<String>,
}
#[derive(Deserialize)]
struct RawSearch {
    result_count: u64,
    page_count: u32,
    results: Vec<RawAudio>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPage {
    pub result_count: u64,
    pub page_count: u32,
    pub results: Vec<RemoteAudio>,
}
pub fn parse_search(data: &[u8]) -> Result<SearchPage, String> {
    if data.len() > 2 * 1024 * 1024 {
        return Err("Odpowiedź Openverse jest zbyt duża".into());
    }
    let raw: RawSearch = serde_json::from_slice(data)
        .map_err(|e| format!("Nieprawidłowa odpowiedź Openverse: {e}"))?;
    let results = raw
        .results
        .into_iter()
        .take(20)
        .filter_map(|r| {
            if r.id.len() != 36 || !r.id.bytes().all(|c| c.is_ascii_hexdigit() || c == b'-') {
                return None;
            }
            let url = r.url?;
            if !url.starts_with("https://") && !url.starts_with("http://") {
                return None;
            }
            let filetype = r.filetype.unwrap_or("mp3".into()).to_lowercase();
            // Jamendo exposes MP3 bitrate variants as mp31/mp32. Keep the
            // original download URL, but use the actual codec's file suffix.
            let extension = match filetype.as_str() {
                "mp31" | "mp32" => "mp3".to_owned(),
                _ => filetype,
            };
            if !["mp3", "ogg", "wav", "flac", "m4a", "aac", "opus"].contains(&extension.as_str()) {
                return None;
            }
            let duration = r.duration.unwrap_or(0.) / 1000.;
            if !duration.is_finite() || duration < 0. || duration > 86400. {
                return None;
            }
            let title = r
                .title
                .filter(|v| !v.is_empty())
                .unwrap_or("Bez tytułu".into());
            let creator = r.creator.unwrap_or_default();
            let source_url = r.foreign_landing_url.unwrap_or_default();
            let license_url = r.license_url.unwrap_or_default();
            let attribution = r.attribution.unwrap_or_else(|| {
                format!(
                    "{title} — {creator}; {}; {source_url}; {license_url}",
                    r.license.to_uppercase()
                )
            });
            Some(RemoteAudio {
                id: r.id,
                title,
                creator,
                duration,
                license: r.license,
                license_url,
                source_url,
                attribution,
                url,
                extension,
            })
        })
        .collect();
    Ok(SearchPage {
        result_count: raw.result_count,
        page_count: raw.page_count.min(20),
        results,
    })
}
pub fn probe(job: &Arc<Job>, ffmpeg: &Path, path: &Path, dir: &Path) -> Result<f64, String> {
    let capture = dir.join("audio-info.json");
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
    args.push(path.as_os_str().to_owned());
    run_process_capture(
        job,
        &ffprobe_path(ffmpeg)?,
        &args,
        false,
        dir,
        Some(&capture),
    )?;
    let bytes = std::fs::read(capture).map_err(|e| e.to_string())?;
    if bytes.len() > 65536 {
        return Err("Zbyt obszerne metadane audio".into());
    }
    let v: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if !v["streams"]
        .as_array()
        .is_some_and(|s| s.iter().any(|s| s["codec_type"] == "audio"))
    {
        return Err("Plik nie zawiera dźwięku".into());
    }
    let duration = v["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .ok_or("Brak czasu audio")?;
    if !duration.is_finite() || !(0.05..=86400.).contains(&duration) {
        return Err("Nieprawidłowy czas audio".into());
    }
    Ok(duration)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_openverse_milliseconds_and_keeps_attribution() {
        let page=parse_search(br#"{"result_count":1,"page_count":1,"results":[{"id":"8624ba61-57f1-4f98-8a85-ece206c319cf","title":"Piano","creator":"Autor","duration":12340,"license":"by","license_url":"https://creativecommons.org/licenses/by/4.0/","foreign_landing_url":"https://example.org/work","attribution":"Credit","url":"https://example.org/audio.mp3","filetype":"mp3"}]}"#).unwrap();
        assert_eq!(page.results[0].duration, 12.34);
        assert_eq!(page.results[0].attribution, "Credit");
        let public = serde_json::to_value(&page).unwrap();
        assert!(public["results"][0].get("url").is_none());
    }
    #[test]
    fn accepts_openverse_jamendo_mp3_variants() {
        for filetype in ["mp31", "mp32", "mp3"] {
            let data = serde_json::json!({"result_count":240,"page_count":12,"results":[{"id":"5d029c9d-1ab7-4f58-a90e-73d58eb03a28","title":"Le piano troix","duration":129000,"license":"by-sa","filetype":filetype,"url":"https://prod-1.storage.jamendo.com/?trackid=150810&format=mp32"}]});
            let page = parse_search(data.to_string().as_bytes()).unwrap();
            assert_eq!(page.results.len(), 1);
            assert_eq!(page.results[0].extension, "mp3");
            assert!(page.results[0].url.ends_with("format=mp32"));
            assert_eq!(page.results[0].duration, 129.);
        }
    }
    #[test]
    fn rejects_non_audio_and_missing_fields() {
        assert!(parse_search(b"{}").is_err());
        let p=parse_search(br#"{"result_count":1,"page_count":1,"results":[{"id":"8624ba61-57f1-4f98-8a85-ece206c319cf","license":"cc0","url":"file:///C:/private.wav","filetype":"wav"}]}"#).unwrap();
        assert!(p.results.is_empty());
    }
}
