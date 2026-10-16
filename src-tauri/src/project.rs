use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Project {
    pub schema_version: u32,
    #[serde(default)]
    pub clips: Option<Vec<Clip>>,
    pub name: String,
    pub media: Option<Media>,
    pub segments: Vec<Segment>,
    pub styles: HashMap<String, Style>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Clip {
    pub id: String,
    pub source_in: f64,
    pub source_out: f64,
    pub start: f64,
}
impl Clip {
    pub fn end(&self) -> f64 {
        self.start + self.source_out - self.source_in
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Media {
    pub path: String,
    pub name: String,
    pub duration: Option<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Segment {
    pub id: String,
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub words: Vec<Word>,
    pub style_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Word {
    pub text: String,
    pub start: f64,
    pub end: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Style {
    pub font_family: String,
    pub font_size: f64,
    pub color: String,
    pub background: String,
    pub position: String,
    #[serde(default)]
    pub uppercase: bool,
    #[serde(default = "default_lines")]
    pub max_lines: u8,
    #[serde(default = "default_chars")]
    pub chars_per_line: u8,
    #[serde(default = "default_words")]
    pub words_per_card: u8,
    #[serde(default = "default_width")]
    pub box_width: f64,
    #[serde(default = "default_radius")]
    pub corner_radius: f64,
    #[serde(default = "default_margin")]
    pub margin_percent: f64,
}
fn default_lines() -> u8 {
    2
}
fn default_chars() -> u8 {
    24
}
fn default_words() -> u8 {
    8
}
fn default_width() -> f64 {
    84.0
}
fn default_radius() -> f64 {
    10.0
}
fn default_margin() -> f64 {
    8.0
}
fn valid_time(t: f64) -> bool {
    t.is_finite() && t >= 0.0
}
fn color(c: &str) -> bool {
    c.len() == 7 && c.starts_with('#') && c[1..].bytes().all(|b| b.is_ascii_hexdigit())
}
pub fn parse(json: &str) -> Result<Project, String> {
    let raw: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("Niepoprawny JSON projektu: {e}"))?;
    if raw.get("schemaVersion").and_then(|v| v.as_u64()) == Some(3) && raw.get("clips").is_none() {
        return Err("Brak listy ujęć w projekcie v3".into());
    }
    let mut p: Project =
        serde_json::from_value(raw).map_err(|e| format!("Niepoprawny JSON projektu: {e}"))?;
    if ![1, 2, 3].contains(&p.schema_version) {
        return Err("Nieobsługiwana wersja projektu".into());
    }
    if p.schema_version < 3 {
        p.clips = p
            .media
            .as_ref()
            .and_then(|m| m.duration)
            .filter(|d| *d >= 0.05)
            .map(|d| {
                vec![Clip {
                    id: "original".into(),
                    source_in: 0.0,
                    source_out: d,
                    start: 0.0,
                }]
            });
    }
    p.schema_version = 3;
    if let Some(clips) = &mut p.clips {
        if clips.len() > 100 {
            return Err("Maksymalnie 100 ujęć w projekcie".into());
        }
        clips.sort_by(|a, b| a.start.total_cmp(&b.start));
        let mut ids = HashSet::new();
        let mut previous = 0.0;
        for c in clips {
            let duration = p
                .media
                .as_ref()
                .and_then(|m| m.duration)
                .ok_or("Ujęcia wymagają filmu ze znanym czasem")?;
            if c.id.is_empty()
                || !ids.insert(c.id.clone())
                || !valid_time(c.start)
                || !valid_time(c.source_in)
                || !valid_time(c.source_out)
                || c.source_out - c.source_in < 0.049999
                || c.source_out > duration + 1e-6
                || c.start < previous - 1e-6
                || c.end() > 86400.0
            {
                return Err("Nieprawidłowe lub nakładające się ujęcia".into());
            }
            previous = c.end();
        }
    }
    if p.name.is_empty()
        || p.name.chars().count() > 200
        || p.created_at.is_empty()
        || p.updated_at.is_empty()
    {
        return Err("Niepoprawne metadane projektu".into());
    }
    if let Some(m) = &p.media {
        if m.path.is_empty() || m.duration.is_some_and(|t| !valid_time(t)) {
            return Err("Niepoprawne dane filmu".into());
        }
    }
    for s in p.styles.values() {
        if s.font_family.is_empty()
            || s.font_family.chars().count() > 100
            || !s.font_size.is_finite()
            || !(12.0..=100.0).contains(&s.font_size)
            || !(1..=3).contains(&s.max_lines)
            || !(12..=48).contains(&s.chars_per_line)
            || !(3..=16).contains(&s.words_per_card)
            || !s.box_width.is_finite()
            || !(40.0..=95.0).contains(&s.box_width)
            || !s.corner_radius.is_finite()
            || !(0.0..=60.0).contains(&s.corner_radius)
            || !s.margin_percent.is_finite()
            || !(0.0..=30.0).contains(&s.margin_percent)
            || !color(&s.color)
            || !color(&s.background)
            || !["bottom", "center", "top"].contains(&s.position.as_str())
        {
            return Err("Niepoprawny styl".into());
        }
    }
    if !p.styles.contains_key("default") {
        return Err("Brak stylu domyślnego".into());
    }
    let mut ids = HashSet::new();
    for s in &p.segments {
        if s.id.is_empty()
            || !ids.insert(&s.id)
            || !p.styles.contains_key(&s.style_id)
            || !valid_time(s.start)
            || !valid_time(s.end)
            || s.end < s.start
            || p.media
                .as_ref()
                .and_then(|m| m.duration)
                .is_some_and(|d| s.end > d)
        {
            return Err("Niepoprawny segment".into());
        }
        for w in &s.words {
            if !valid_time(w.start)
                || !valid_time(w.end)
                || w.end < w.start
                || w.start < s.start
                || w.end > s.end
            {
                return Err("Niepoprawny czas słowa".into());
            }
        }
    }
    Ok(p)
}
pub fn composition_duration(p: &Project) -> f64 {
    p.clips
        .as_ref()
        .map(|c| c.iter().map(Clip::end).fold(0.0, f64::max))
        .unwrap_or_else(|| p.media.as_ref().and_then(|m| m.duration).unwrap_or(0.0))
}
/// Captions supplied for rendering use composition time; saved project captions use source time.
pub fn export_captions(p: &Project, json: Option<&str>) -> Result<Vec<Segment>, String> {
    let Some(json) = json else {
        return Ok(p.segments.clone());
    };
    if json.len() > 16 * 1024 * 1024 {
        return Err("Napisy przekraczają 16 MB".into());
    }
    let segments: Vec<Segment> =
        serde_json::from_str(json).map_err(|e| format!("Nieprawidłowe napisy eksportu: {e}"))?;
    if segments.len() > 3000 {
        return Err("Maksymalnie 3000 plansz napisów".into());
    }
    let duration = composition_duration(p);
    if segments.iter().any(|s| s.end > duration + 1e-6) {
        return Err("Napisy wychodzą poza montaż".into());
    }
    let mut validation = p.clone();
    validation.clips = None;
    validation.segments = segments;
    if let Some(media) = validation.media.as_mut() {
        media.duration = Some(duration);
    }
    Ok(parse(&serde_json::to_string(&validation).map_err(|e| e.to_string())?)?.segments)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn json() -> String {
        serde_json::json!({"schemaVersion":1,"name":"Zażółć 🎬","media":null,"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#111111","position":"bottom"}},"createdAt":"2026-10-14T00:00:00Z","updatedAt":"2026-10-14T00:00:00Z"}).to_string()
    }
    #[test]
    fn migrate_v1_and_validate_layout() {
        let project = parse(&json()).unwrap();
        assert_eq!(project.schema_version, 3);
        assert!(!project.styles["default"].uppercase);
        assert_eq!(project.styles["default"].max_lines, 2);
        let mut value = serde_json::to_value(project).unwrap();
        value["styles"]["default"]["maxLines"] = serde_json::json!(4);
        assert!(parse(&value.to_string()).is_err());
    }
    #[test]
    fn unicode_roundtrip() {
        let p = parse(&json()).unwrap();
        assert_eq!(
            parse(&serde_json::to_string(&p).unwrap()).unwrap().name,
            "Zażółć 🎬"
        );
    }
    #[test]
    fn future_version_rejected() {
        assert!(parse(&json().replace("\"schemaVersion\":1", "\"schemaVersion\":99")).is_err());
    }
    #[test]
    fn missing_default_rejected() {
        let mut v: serde_json::Value = serde_json::from_str(&json()).unwrap();
        v["styles"] = serde_json::json!({});
        assert!(parse(&v.to_string()).is_err());
    }
    #[test]
    fn invalid_word_rejected() {
        let mut v: serde_json::Value = serde_json::from_str(&json()).unwrap();
        v["segments"] = serde_json::json!([{"id":"a","text":"a","start":0,"end":1,"styleId":"default","words":[{"text":"a","start":0,"end":2}]}]);
        assert!(parse(&v.to_string()).is_err());
    }
    #[test]
    fn montage_migration_bounds_and_caption_timebase() {
        let mut v: serde_json::Value = serde_json::from_str(&json()).unwrap();
        v["media"] = serde_json::json!({"path":"C:/Łódź.mp4","name":"test","duration":10});
        let mut p = parse(&v.to_string()).unwrap();
        assert_eq!(p.clips.as_ref().unwrap()[0].source_out, 10.0);
        p.clips = Some(vec![Clip {
            id: "cut".into(),
            source_in: 7.0,
            source_out: 10.0,
            start: 0.0,
        }]);
        assert_eq!(composition_duration(&p), 3.0);
        let cap=serde_json::json!([{"id":"mapped","text":"tekst","start":1,"end":2,"words":[],"styleId":"default"}]).to_string();
        assert_eq!(export_captions(&p, Some(&cap)).unwrap()[0].start, 1.0);
        assert!(export_captions(&p, Some(&cap.replace("\"end\":2", "\"end\":4"))).is_err());
        let mut encoded = serde_json::to_value(&p).unwrap();
        encoded["clips"][0]["sourceOut"] = serde_json::json!(11);
        assert!(parse(&encoded.to_string()).is_err());
        encoded["clips"] = serde_json::json!([{"id":"a","sourceIn":0,"sourceOut":5,"start":0},{"id":"b","sourceIn":5,"sourceOut":10,"start":4}]);
        assert!(parse(&encoded.to_string()).is_err());
        encoded["clips"] = serde_json::json!([]);
        assert_eq!(
            composition_duration(&parse(&encoded.to_string()).unwrap()),
            0.0
        );
        encoded.as_object_mut().unwrap().remove("clips");
        assert!(parse(&encoded.to_string()).is_err());
    }
}
