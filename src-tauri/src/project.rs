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
    #[serde(default)]
    pub assets: Vec<Asset>,
    #[serde(default)]
    pub caption_edits: HashMap<String, CaptionEdit>,
    #[serde(default)]
    pub transitions: Vec<Transition>,
    #[serde(default)]
    pub timeline_segments: Option<Vec<Segment>>,
    pub segments: Vec<Segment>,
    pub styles: HashMap<String, Style>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Clip {
    pub id: String,
    pub source_in: f64,
    pub source_out: f64,
    pub start: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_id: Option<String>,
    #[serde(default)]
    pub track: u8,
    #[serde(default = "video_kind")]
    pub kind: String,
    #[serde(default = "unit_volume")]
    pub volume: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub adjustments: Option<Adjustments>,
}
fn video_kind() -> String {
    "video".into()
}
fn unit_volume() -> f64 {
    1.0
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Asset {
    pub id: String,
    pub path: String,
    pub name: String,
    pub duration: f64,
    pub kind: String,
    pub segments: Vec<Segment>,
}
impl Project {
    pub fn clip_path(&self, c: &Clip) -> Option<&str> {
        match &c.asset_id {
            Some(id) => self
                .assets
                .iter()
                .find(|a| &a.id == id)
                .map(|a| a.path.as_str()),
            None => self.media.as_ref().map(|m| m.path.as_str()),
        }
    }
    pub fn clip_duration(&self, c: &Clip) -> Option<f64> {
        match &c.asset_id {
            Some(id) => self.assets.iter().find(|a| &a.id == id).map(|a| a.duration),
            None => self.media.as_ref().and_then(|m| m.duration),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Adjustments {
    pub brightness: f64,
    pub contrast: f64,
    pub saturation: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaptionEdit {
    pub trim_start: f64,
    pub trim_end: f64,
    pub text: Option<String>,
    #[serde(default)]
    pub hidden: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Transition {
    pub id: String,
    pub from_id: String,
    pub to_id: String,
    pub kind: String,
    pub duration: f64,
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
    pub effect: Option<String>,
    pub outline_color: Option<String>,
    pub outline_width: Option<f64>,
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
    if raw
        .get("schemaVersion")
        .and_then(|v| v.as_u64())
        .is_some_and(|v| v >= 3)
        && raw.get("clips").is_none()
    {
        return Err("Brak listy ujęć w projekcie v3".into());
    }
    let mut p: Project =
        serde_json::from_value(raw).map_err(|e| format!("Niepoprawny JSON projektu: {e}"))?;
    if ![1, 2, 3, 4, 5, 6].contains(&p.schema_version) {
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
                    kind: video_kind(),
                    volume: 1.0,
                    ..Clip::default()
                }]
            });
    }
    if p.schema_version < 6 {
        for t in &mut p.transitions {
            t.kind = match t.kind.as_str() {
                "left" => "slideleft",
                "right" => "slideright",
                "black" => "fadeblack",
                other => other,
            }
            .into();
        }
    }
    p.schema_version = 6;
    if p.assets.len() > 100 {
        return Err("Zbyt wiele źródeł".into());
    }
    let mut asset_ids = HashSet::new();
    for a in &p.assets {
        if a.id.is_empty()
            || a.id == "primary"
            || !asset_ids.insert(&a.id)
            || a.path.is_empty()
            || !valid_time(a.duration)
            || a.duration < 0.05
            || !["video", "audio"].contains(&a.kind.as_str())
        {
            return Err("Nieprawidłowe źródło".into());
        }
        let mut validation = p.clone();
        validation.assets.clear();
        validation.clips = None;
        validation.transitions.clear();
        validation.timeline_segments = None;
        validation.media = Some(Media {
            path: a.path.clone(),
            name: a.name.clone(),
            duration: Some(a.duration),
        });
        validation.segments = a.segments.clone();
        parse(&serde_json::to_string(&validation).map_err(|e| e.to_string())?)?;
    }
    if let Some(clips) = &p.clips {
        if clips.len() > 100 {
            return Err("Maksymalnie 100 ujęć".into());
        }
        let mut ids = HashSet::new();
        for (i, c) in clips.iter().enumerate() {
            let duration = p.clip_duration(c).ok_or("Brak źródła ujęcia")?;
            if c.id.is_empty()
                || !ids.insert(&c.id)
                || !valid_time(c.start)
                || !valid_time(c.source_in)
                || !valid_time(c.source_out)
                || c.source_out - c.source_in < 0.049999
                || c.source_out > duration + 1e-6
                || c.end() > 86400.0
                || c.track > 1
                || !["video", "audio"].contains(&c.kind.as_str())
                || !c.volume.is_finite()
                || !(0.0..=1.0).contains(&c.volume)
            {
                return Err("Nieprawidłowe ujęcie".into());
            }
            if c.kind == "video"
                && (p
                    .assets
                    .iter()
                    .any(|a| Some(&a.id) == c.asset_id.as_ref() && a.kind == "audio")
                    || clips[..i].iter().any(|o| {
                        o.kind == "video"
                            && o.track == c.track
                            && c.start < o.end() - 1e-6
                            && c.end() > o.start + 1e-6
                    }))
            {
                return Err("Nakładające się ujęcia na jednej ścieżce wideo".into());
            }
        }
    }
    if p.caption_edits.len() > 10000
        || p.caption_edits.values().any(|e| {
            !valid_time(e.trim_start)
                || !valid_time(e.trim_end)
                || e.text.as_ref().is_some_and(|t| t.len() > 400000)
        })
    {
        return Err("Nieprawidłowe zmiany napisów".into());
    }
    let mut tids = HashSet::new();
    let mut destinations = HashSet::new();
    if p.transitions.len() > 99 {
        return Err("Zbyt wiele przejść".into());
    }
    for t in &p.transitions {
        let clips = p.clips.as_deref().unwrap_or(&[]);
        let a = clips
            .iter()
            .find(|c| c.id == t.from_id)
            .ok_or("Brak ujęcia przejścia")?;
        let b = clips
            .iter()
            .find(|c| c.id == t.to_id)
            .ok_or("Brak ujęcia przejścia")?;
        if t.id.is_empty()
            || !tids.insert(&t.id)
            || !destinations.insert(&t.to_id)
            || !t.duration.is_finite()
            || !(0.1..=2.0).contains(&t.duration)
            || !crate::effects::KINDS.contains(&t.kind.as_str())
            || a.kind != "video"
            || b.kind != "video"
            || a.track != b.track
            || (a.end() - b.start).abs() > 1e-6
            || b.source_in < t.duration - 1e-6
            || a.source_out - a.source_in < t.duration - 1e-6
        {
            return Err("Nieprawidłowe przejście".into());
        }
    }
    for c in p.clips.as_deref().unwrap_or(&[]) {
        if c.adjustments.as_ref().is_some_and(|a| {
            !a.brightness.is_finite()
                || !a.contrast.is_finite()
                || !a.saturation.is_finite()
                || !(0.25..=2.0).contains(&a.brightness)
                || !(0.25..=2.0).contains(&a.contrast)
                || !(0.0..=2.0).contains(&a.saturation)
        }) {
            return Err("Nieprawidłowa korekcja obrazu".into());
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
        if s.effect
            .as_ref()
            .is_some_and(|e| !["box", "outline", "highlight"].contains(&e.as_str()))
            || s.outline_color.as_ref().is_some_and(|c| !color(c))
            || s.outline_width
                .is_some_and(|v| !v.is_finite() || !(0.0..=8.0).contains(&v))
        {
            return Err("Nieprawidłowy efekt napisów".into());
        }
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
    if let Some(segments) = &p.timeline_segments {
        let mut validation = p.clone();
        validation.timeline_segments = None;
        validation.assets.clear();
        validation.clips = None;
        validation.transitions.clear();
        validation.segments = segments.clone();
        if let Some(media) = &mut validation.media {
            media.duration = Some(86400.0);
        } else if !segments.is_empty() {
            return Err("Brak montażu dla napisów".into());
        }
        parse(&serde_json::to_string(&validation).map_err(|e| e.to_string())?)?;
    }
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
    validation.transitions.clear();
    validation.timeline_segments = None;
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
        assert_eq!(project.schema_version, 6);
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
            kind: video_kind(),
            volume: 1.0,
            ..Clip::default()
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
