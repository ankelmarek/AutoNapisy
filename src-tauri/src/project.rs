use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Project {
    pub schema_version: u32,
    #[serde(default)]
    pub master_audio: MasterAudio,
    #[serde(default)]
    pub ripple_enabled: bool,
    #[serde(default)]
    pub canvas: Option<Canvas>,
    #[serde(default)]
    pub tracks: TrackControls,
    #[serde(default = "default_track_layout")]
    pub track_layout: Vec<TrackDescriptor>,
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
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct MasterAudio {
    pub gain_db:f64,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub normalization:Option<Normalization>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Normalization {
    pub target_lufs:f64,
    pub basis:String,
    #[serde(default)]
    pub stale:bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Canvas {
    pub width: u32,
    pub height: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Transform {
    pub scale: f64,
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Provenance {
    pub provider: String,
    pub external_id: String,
    pub title: String,
    pub creator: String,
    pub license: String,
    pub license_url: String,
    pub source_url: String,
    pub attribution: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TrackState {
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub hidden: bool,
    #[serde(default)]
    pub locked: bool,
    #[serde(default = "auto_ripple")]
    pub ripple: String,
}
pub const MAX_TRACKS: u8 = 16;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TrackDescriptor {
    pub id: String,
    pub kind: String,
    pub index: u8,
}
pub fn default_track_layout() -> Vec<TrackDescriptor> {
    ["video", "audio"]
        .into_iter()
        .flat_map(|kind| {
            (0..2).map(move |index| TrackDescriptor {
                id: format!("{}{}", if kind == "video" { "V" } else { "A" }, index + 1),
                kind: kind.into(),
                index,
            })
        })
        .collect()
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct TrackControls {
    #[serde(rename = "V1", default)]
    pub v1: TrackState,
    #[serde(rename = "V2", default)]
    pub v2: TrackState,
    #[serde(rename = "A1", default)]
    pub a1: TrackState,
    #[serde(rename = "A2", default)]
    pub a2: TrackState,
    #[serde(rename = "T", default)]
    pub captions: TrackState,
    #[serde(flatten)]
    pub extra: HashMap<String, TrackState>,
}
impl Default for TrackState {
    fn default() -> Self {
        Self {
            muted: false,
            hidden: false,
            locked: false,
            ripple: "auto".into(),
        }
    }
}
fn auto_ripple() -> String {
    "auto".into()
}
impl TrackControls {
    pub fn state(&self, id: &str) -> Option<&TrackState> {
        match id {
            "V1" => Some(&self.v1),
            "V2" => Some(&self.v2),
            "A1" => Some(&self.a1),
            "A2" => Some(&self.a2),
            "T" => Some(&self.captions),
            _ => self.extra.get(id),
        }
    }
    pub fn video_hidden(&self, c: &Clip) -> bool {
        c.kind != "audio"
            && self
                .state(&format!("V{}", c.track as u16 + 1))
                .is_some_and(|s| s.hidden)
    }
    pub fn audio_muted(&self, c: &Clip) -> bool {
        c.audio_detached
            || c.audio_lane().is_some_and(|lane| {
                self.state(&format!("A{}", lane as u16 + 1))
                    .is_some_and(|s| s.muted)
            })
            || (c.kind != "audio"
                && self
                    .state(&format!("V{}", c.track as u16 + 1))
                    .is_some_and(|s| s.muted))
    }
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio_route: Option<String>,
    #[serde(default = "video_kind")]
    pub kind: String,
    #[serde(default = "unit_volume")]
    pub volume: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio: Option<AudioEnvelope>,
    #[serde(default)]
    pub audio_detached: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sync_group: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crossfade: Option<Crossfade>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transform: Option<Transform>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub adjustments: Option<Adjustments>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioEnvelope {
    pub points: Vec<VolumePoint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fade_in: Option<Fade>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fade_out: Option<Fade>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Crossfade {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fade_in: Option<Fade>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fade_out: Option<Fade>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VolumePoint {
    pub id: String,
    pub time: f64,
    pub gain: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Fade {
    pub anchor: f64,
    pub duration: f64,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<Provenance>,
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
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub style_id: Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub offset: Option<f64>,
    pub trim_start: f64,
    pub trim_end: f64,
    pub text: Option<String>,
    #[serde(default)]
    pub hidden: bool,
    #[serde(default)]
    pub locked: bool,
    #[serde(default = "auto_ripple")]
    pub ripple: String,
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
    pub fn audio_lane(&self) -> Option<u8> {
        if self.kind == "audio" {
            return Some(self.track);
        }
        match self.audio_route.as_deref() {
            Some("embedded") => None,
            Some(id) => id
                .strip_prefix('A')
                .and_then(|n| n.parse::<u8>().ok())
                .and_then(|n| n.checked_sub(1)),
            None => (self.track < 2).then_some(self.track),
        }
    }
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub animation: Option<CaptionAnimation>,
    pub effect: Option<String>,
    pub outline_color: Option<String>,
    pub outline_width: Option<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaptionAnimation {
    pub preset: String,
    pub version: u32,
    pub accent_color: String,
    pub speed: f64,
    pub intensity: f64,
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
    if raw["schemaVersion"].as_u64().is_some_and(|v|v<=11)&&raw.get("masterAudio").is_some(){return Err("Pole miksu nie należy do starszego schematu".into());}
    if raw["schemaVersion"].as_u64().is_some_and(|v|v<=13)&&raw["captionEdits"].as_object().is_some_and(|edits|edits.values().any(|e|e.get("offset").is_some())){return Err("Przesunięcia napisów wymagają schematu v14".into());}
    if raw["schemaVersion"].as_u64().is_some_and(|v|v<=14) && raw["styles"].as_object().is_some_and(|styles|styles.values().any(|s|s.get("animation").is_some())) { return Err("Animowane napisy wymagają schematu v15".into()); }
    if raw["styles"].as_object().is_some_and(|styles|styles.values().any(|s|s.get("animation").is_some_and(|a|a.is_null()))) { return Err("Nieprawidłowa animacja napisów".into()); }
    if raw["captionEdits"].as_object().is_some_and(|edits|edits.values().any(|e|e.get("styleId").is_some_and(|v|v.as_str().is_none_or(|s|s.is_empty()||s.chars().count()>100)))) {return Err("Nieprawidłowy styl napisu".into());}
    if raw["schemaVersion"].as_u64().is_some_and(|v|v<=14) && raw["captionEdits"].as_object().is_some_and(|edits|edits.values().any(|e|e.get("styleId").is_some())) {return Err("Styl pojedynczego napisu wymaga v15".into());}
    let legacy = raw["schemaVersion"].as_u64().is_some_and(|v| v <= 10);
    if legacy && raw.get("trackLayout").is_some() {
        return Err("Starszy projekt nie może definiować nowych ścieżek".into());
    }
    let mut p: Project =
        serde_json::from_value(raw).map_err(|e| format!("Niepoprawny JSON projektu: {e}"))?;
    if ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].contains(&p.schema_version) {
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
    if p.schema_version < 10 {
        p.ripple_enabled = false;
    }
    if legacy {
        if !p.tracks.extra.is_empty()
            || p.clips
                .as_deref()
                .unwrap_or(&[])
                .iter()
                .any(|c| c.track > 1 || c.audio_route.is_some())
        {
            return Err("Nieprawidłowe ścieżki starszego projektu".into());
        }
        p.track_layout = default_track_layout();
        for c in p.clips.as_deref_mut().unwrap_or(&mut []) {
            if c.kind != "audio" {
                c.audio_route = Some(format!("A{}", c.track + 1));
            }
        }
    }
    // Before v13 array order had no meaning; preserve historical numeric stacking.
    if p.schema_version <= 12 { p.track_layout.sort_by_key(|t| (if t.kind=="video" {0} else {1},t.index)); }
    p.schema_version = 15;
    let master=&p.master_audio;
    if !master.gain_db.is_finite()|| !(-60.0..=24.0).contains(&master.gain_db)||master.normalization.as_ref().is_some_and(|n|!n.target_lufs.is_finite()|| !(-30.0..=-9.0).contains(&n.target_lufs)||n.basis.len()!=16||!n.basis.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b))){return Err("Nieprawidłowa normalizacja miksu".into());}
    let mut track_ids = HashSet::new();
    if p.track_layout.len() < 4
        || p.track_layout.len() > MAX_TRACKS as usize * 2
        || p.track_layout.iter().any(|t| {
            t.index >= MAX_TRACKS
                || !["video", "audio"].contains(&t.kind.as_str())
                || t.id
                    != format!(
                        "{}{}",
                        if t.kind == "video" { "V" } else { "A" },
                        t.index as u16 + 1
                    )
                || !track_ids.insert(t.id.clone())
        })
        || ["V1", "V2", "A1", "A2"]
            .iter()
            .any(|id| !track_ids.contains(*id))
        || p.tracks.extra.keys().any(|id| !track_ids.contains(id))
    {
        return Err("Nieprawidłowa lista ścieżek".into());
    }
    for t in [
        &p.tracks.v1,
        &p.tracks.v2,
        &p.tracks.a1,
        &p.tracks.a2,
        &p.tracks.captions,
    ]
    .into_iter()
    .chain(p.tracks.extra.values())
    {
        if !["auto", "on", "off"].contains(&t.ripple.as_str()) {
            return Err("Nieprawidłowy tryb Ripple".into());
        }
    }
    if p.canvas.as_ref().is_some_and(|v| {
        v.width < 128
            || v.height < 128
            || v.width > 3840
            || v.height > 3840
            || v.width % 2 != 0
            || v.height % 2 != 0
    }) {
        return Err("Nieprawidłowy rozmiar obrazu".into());
    }
    for c in p.clips.as_deref().unwrap_or(&[]) {
        if c.transform.as_ref().is_some_and(|t| {
            !t.scale.is_finite()
                || !(0.1..=4.0).contains(&t.scale)
                || !t.x.is_finite()
                || !t.y.is_finite()
                || t.x.abs() > 2.0
                || t.y.abs() > 2.0
        }) {
            return Err("Nieprawidłowe kadrowanie filmu".into());
        }
    }
    for a in &p.assets {
        if a.provenance.as_ref().is_some_and(|v| {
            !["kenney", "openverse"].contains(&v.provider.as_str())
                || v.external_id.len() > 200
                || v.title.len() > 2000
                || v.creator.len() > 2000
                || v.license.len() > 100
                || v.license_url.len() > 2000
                || v.source_url.len() > 2000
                || v.attribution.len() > 10000
        }) {
            return Err("Nieprawidłowe informacje o licencji audio".into());
        }
    }
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
                || !track_ids.contains(&format!(
                    "{}{}",
                    if c.kind == "audio" { "A" } else { "V" },
                    c.track as u16 + 1
                ))
                || (c.kind == "audio" && c.audio_route.is_some())
                || c.audio_route.as_ref().is_some_and(|id| {
                    id != "embedded" && (!id.starts_with('A') || !track_ids.contains(id))
                })
                || !["video", "audio"].contains(&c.kind.as_str())
                || !c.volume.is_finite()
                || !(0.0..=1.0).contains(&c.volume)
            {
                return Err("Nieprawidłowe ujęcie".into());
            }
            if (c.audio_detached && c.kind == "audio")
                || (c.crossfade.is_some() && c.kind != "audio")
                || c.sync_group
                    .as_ref()
                    .is_some_and(|s| s.is_empty() || s.chars().count() > 100)
            {
                return Err("Nieprawidłowe powiązanie audio".into());
            }
            crate::audio_envelope::validate(c, duration)?;
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
            e.style_id.as_ref().is_some_and(|id| !p.styles.contains_key(id)) || !valid_time(e.trim_start)
                || !valid_time(e.trim_end)
                || e.offset.is_some_and(|t| !t.is_finite() || t.abs()>86400.)
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
        if let Some(a) = &s.animation {
            if a.version != 1 || !["karaoke-flow", "pop-beat", "impact", "neon", "slide-reveal", "marker", "editorial", "type-flow"].contains(&a.preset.as_str()) || !color(&a.accent_color) || !a.speed.is_finite() || !(0.5..=2.).contains(&a.speed) || !a.intensity.is_finite() || !(0.0..=1.).contains(&a.intensity) { return Err("Nieprawidłowa animacja napisów".into()); }
        }
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
        } else {
            validation.media = Some(Media {
                path: "timeline".into(),
                name: "Montaż audio".into(),
                duration: Some(86400.0),
            });
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
    if p.tracks.captions.hidden {
        return Ok(vec![]);
    }
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
    fn all_eight_caption_presets_and_individual_style_are_strict() {
        let p=parse(&json()).unwrap();
        for preset in ["karaoke-flow","pop-beat","impact","neon","slide-reveal","marker","editorial","type-flow"] {
            let mut v=serde_json::to_value(&p).unwrap();
            v["styles"]["styled"]=v["styles"]["default"].clone();
            v["styles"]["styled"]["animation"]=serde_json::json!({"preset":preset,"version":1,"accentColor":"#a572ff","speed":1,"intensity":0.7});
            v["captionEdits"]=serde_json::json!({"timeline:one":{"trimStart":0,"trimEnd":0,"styleId":"styled"}});
            let loaded=parse(&v.to_string()).unwrap();
            assert_eq!(loaded.caption_edits["timeline:one"].style_id.as_deref(),Some("styled"));
            assert_eq!(loaded.styles["styled"].animation.as_ref().unwrap().preset,preset);
            v["captionEdits"]["timeline:one"]["styleId"]=serde_json::json!("missing");
            assert!(parse(&v.to_string()).is_err());
            v["captionEdits"]["timeline:one"]["styleId"]=serde_json::json!("default");
            v["styles"].as_object_mut().unwrap().remove("styled");
            v["schemaVersion"]=serde_json::json!(14);
            assert!(parse(&v.to_string()).is_err());
        }
    }
    #[test]
    fn migrate_v1_and_validate_layout() {
        let project = parse(&json()).unwrap();
        assert_eq!(project.schema_version, 15);
        assert!(!project.styles["default"].uppercase);
        assert_eq!(project.styles["default"].max_lines, 2);
        let mut value = serde_json::to_value(project).unwrap();
        value["styles"]["default"]["maxLines"] = serde_json::json!(4);
        assert!(parse(&value.to_string()).is_err());
    }
    #[test]
    fn track_controls_roundtrip_and_hidden_caption_export() {
        let mut p = parse(&json()).unwrap();
        assert!(!p.tracks.v1.muted && !p.tracks.v2.hidden);
        p.tracks.v1.muted = true;
        p.tracks.v2.hidden = true;
        p.tracks.captions.hidden = true;
        let encoded = serde_json::to_string(&p).unwrap();
        let decoded = parse(&encoded).unwrap();
        assert!(decoded.tracks.v1.muted && decoded.tracks.v2.hidden);
        assert!(export_captions(&decoded, Some("[]")).unwrap().is_empty());
        let mut value = serde_json::to_value(p).unwrap();
        value["tracks"]["V3"] = serde_json::json!({"muted":true});
        assert!(parse(&value.to_string()).is_err());
    }
    #[test]
    fn timeline_captions_support_audio_only_projects() {
        let mut v: serde_json::Value = serde_json::from_str(&json()).unwrap();
        v["schemaVersion"] = serde_json::json!(6);
        v["clips"] = serde_json::json!([]);
        v["timelineSegments"] = serde_json::json!([{"id":"t","text":"Mowa","start":1,"end":2,"words":[],"styleId":"default"}]);
        assert_eq!(
            parse(&v.to_string())
                .unwrap()
                .timeline_segments
                .unwrap()
                .len(),
            1
        );
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

#[cfg(test)]
mod edit018_tests {
    use super::*;
    fn value() -> serde_json::Value {
        serde_json::json!({"schemaVersion":10,"rippleEnabled":true,"name":"Łódź","media":{"path":"C:/Łódź.mp4","name":"Film","duration":10},"clips":[{"id":"v","start":0,"sourceIn":1,"sourceOut":5,"audioDetached":true,"syncGroup":"pair"},{"id":"a","kind":"audio","start":0,"sourceIn":1,"sourceOut":5,"syncGroup":"pair","crossfade":{"fadeIn":{"anchor":1,"duration":1}},"audio":{"points":[],"fadeOut":{"anchor":5,"duration":1}}}],"tracks":{"V1":{"ripple":"on","locked":true}},"segments":[],"styles":{"default":{"fontFamily":"Arial","fontSize":40,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-18T00:00:00Z","updatedAt":"2026-10-18T00:00:00Z"})
    }
    #[test]
    fn edit_controls_detach_and_crossfade_roundtrip() {
        let p = parse(&value().to_string()).unwrap();
        assert!(p.ripple_enabled && p.tracks.v1.locked);
        assert!(p.tracks.audio_muted(&p.clips.as_ref().unwrap()[0]));
        let q = parse(&serde_json::to_string(&p).unwrap()).unwrap();
        assert_eq!(q.schema_version, 15);
        assert_eq!(q.tracks.v1.ripple, "on");
        assert_eq!(q.clips.unwrap()[1].sync_group.as_deref(), Some("pair"));
    }
    #[test]
    fn legacy_migration_disables_ripple_and_invalid_controls_rejected() {
        let mut v = value();
        v["schemaVersion"] = 9.into();
        assert!(!parse(&v.to_string()).unwrap().ripple_enabled);
        v["schemaVersion"] = 10.into();
        v["tracks"]["V1"]["ripple"] = "guessed".into();
        assert!(parse(&v.to_string()).is_err());
        v = value();
        v["clips"][0]["kind"] = "audio".into();
        assert!(parse(&v.to_string()).is_err());
        v = value();
        v["clips"][1]["crossfade"]["fadeIn"]["duration"] = 11.into();
        assert!(parse(&v.to_string()).is_err());
    }
    #[test]
    fn detached_volume_fades_are_multiplicative_not_replaced() {
        let p = parse(&value().to_string()).unwrap();
        let clips = p.clips.unwrap();
        assert_eq!(crate::audio_envelope::gain(&clips[0], 2.), 0.);
        assert!((crate::audio_envelope::gain(&clips[1], 1.5) - 0.5).abs() < 1e-9);
        assert!((crate::audio_envelope::gain(&clips[1], 4.5) - 0.5).abs() < 1e-9);
        assert!(crate::audio_envelope::expression(&clips[1], "t").contains("clip"));
    }
}

#[cfg(test)]
mod dynamic022_tests {
    use super::*;
    fn fixture() -> serde_json::Value {
        serde_json::from_str(include_str!("../../tests/fixtures/three-tracks-v11.json")).unwrap()
    }
    #[test]
    fn shared_three_track_document_roundtrips_and_does_not_need_a_pair() {
        let mut p = parse(&fixture().to_string()).unwrap();
        assert_eq!(p.track_layout.len(), 6);
        assert_eq!(p.clips.as_ref().unwrap()[2].audio_lane(), None);
        p.clips.as_mut().unwrap().retain(|c| c.id != "a2");
        p.track_layout.retain(|t| t.id != "A3");
        p.tracks.extra.remove("A3");
        assert_eq!(
            parse(&serde_json::to_string(&p).unwrap())
                .unwrap()
                .schema_version,
            15
        );
    }
    #[test]
    fn legacy_versions_preserve_routes_mute_locks_and_v10_ripple() {
        for version in 1..=10 {
            let mut value = fixture();
            value["schemaVersion"] = version.into();
            value.as_object_mut().unwrap().remove("trackLayout");
            value["tracks"] = serde_json::json!({"A2":{"muted":true},"V2":{"locked":true}});
            let clips = value["clips"].as_array_mut().unwrap();
            clips.retain(|c| c["track"] != 2);
            for c in clips {
                c.as_object_mut().unwrap().remove("audioRoute");
            }
            let p = parse(&value.to_string()).unwrap();
            assert_eq!(p.track_layout.len(), 4);
            assert_eq!(p.ripple_enabled, version == 10);
            assert!(p.tracks.v2.locked);
            if version >= 3 {
                let c = &p.clips.as_ref().unwrap()[1];
                assert_eq!(c.audio_lane(), Some(1));
                assert!(p.tracks.audio_muted(c));
            }
        }
    }
    #[test]
    fn invalid_layout_tracks_routes_and_legacy_extensions_rejected() {
        for bad in [
            "duplicate",
            "mismatch",
            "missing",
            "route",
            "audio-route",
            "legacy",
            "limit",
            "unknown",
        ] {
            let mut v = fixture();
            match bad {
                "duplicate" => {
                    let first = v["trackLayout"][0].clone();
                    v["trackLayout"].as_array_mut().unwrap().push(first);
                }
                "mismatch" => v["trackLayout"][2]["kind"] = "audio".into(),
                "missing" => v["clips"][0]["track"] = 4.into(),
                "route" => v["clips"][0]["audioRoute"] = "A4".into(),
                "audio-route" => v["clips"][3]["audioRoute"] = "embedded".into(),
                "legacy" => v["schemaVersion"] = 10.into(),
                "limit" => v["trackLayout"][2]["index"] = 16.into(),
                _ => v["tracks"]["X3"] = serde_json::json!({"muted":true}),
            }
            assert!(parse(&v.to_string()).is_err(), "accepted {bad}");
        }
    }
    #[test]
    fn dynamic_video_and_audio_mute_are_independent_of_visibility() {
        let mut p = parse(&fixture().to_string()).unwrap();
        p.tracks.a1.muted = true;
        p.tracks.a2.muted = true;
        let c = &p.clips.as_ref().unwrap()[2];
        assert!(!p.tracks.audio_muted(c));
        p.tracks.extra.entry("V3".into()).or_default().hidden = true;
        assert!(p.tracks.video_hidden(c));
        assert!(!p.tracks.audio_muted(c));
        p.tracks.extra.entry("V3".into()).or_default().muted = true;
        assert!(p.tracks.audio_muted(c));
        p.tracks.extra.entry("A3".into()).or_default().muted = true;
        assert!(p.tracks.audio_muted(&p.clips.as_ref().unwrap()[5]));
    }
}

#[cfg(test)]mod master024_tests {
 use super::*;
 fn legacy()->serde_json::Value {serde_json::from_str(include_str!("../../tests/fixtures/three-tracks-v11.json")).unwrap()}
 #[test]fn migrate_v11_keeps_tracks_and_master_roundtrips(){let mut p=parse(&legacy().to_string()).unwrap();assert_eq!(p.schema_version,15);assert_eq!(p.master_audio.gain_db,0.);p.master_audio=MasterAudio{gain_db:1.9,normalization:Some(Normalization{target_lufs:-14.,basis:"0123456789abcdef".into(),stale:false})};let q=parse(&serde_json::to_string(&p).unwrap()).unwrap();assert_eq!(q.master_audio.gain_db,1.9);assert_eq!(q.track_layout.len(),6);assert_eq!(q.master_audio.normalization.unwrap().target_lufs,-14.);}
 #[test]fn master_bounds_and_legacy_injection_rejected(){for master in [serde_json::json!({"gainDb":25}),serde_json::json!({"gainDb":-61}),serde_json::json!({"gainDb":0,"normalization":{"targetLufs":-8,"basis":"0123456789abcdef"}}),serde_json::json!({"gainDb":0,"normalization":{"targetLufs":-14,"basis":"wrong"}}),serde_json::json!({"gainDb":0,"execute":"x"})]{let mut v=legacy();v["schemaVersion"]=12.into();v["masterAudio"]=master;assert!(parse(&v.to_string()).is_err());}let mut v=legacy();v["masterAudio"]=serde_json::json!({"gainDb":0});assert!(parse(&v.to_string()).is_err());}
}

impl Project {
 pub fn video_rank(&self,index:u8)->usize { self.track_layout.iter().filter(|t|t.kind=="video").position(|t|t.index==index).unwrap_or(0) }
}

#[cfg(test)]
mod order027_tests {
 use super::*;
 #[test] fn legacy_numeric_stacking_and_v13_roundtrip(){
 let mut p=parse(include_str!("../../tests/fixtures/three-tracks-v11.json")).unwrap();
 p.track_layout.reverse();p.schema_version=12;
 let old=parse(&serde_json::to_string(&p).unwrap()).unwrap();assert_eq!(old.video_rank(0),0);assert_eq!(old.video_rank(2),2);assert_eq!(old.schema_version,15);
 p.schema_version=13;let new=parse(&serde_json::to_string(&p).unwrap()).unwrap();assert_eq!(new.video_rank(2),0);assert_eq!(new.video_rank(0),2);assert_eq!(serde_json::to_value(new.clips).unwrap(),serde_json::to_value(old.clips).unwrap());
 }
 #[test] fn rank_supports_stable_non_contiguous_ids(){let mut p=parse(include_str!("../../tests/fixtures/three-tracks-v11.json")).unwrap();p.track_layout.insert(0,TrackDescriptor{id:"V16".into(),kind:"video".into(),index:15});assert_eq!(p.video_rank(15),0);assert_eq!(p.video_rank(0),1);}
}
