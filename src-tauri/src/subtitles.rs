use crate::project::{Project, Segment};
/// Resolve the actual composition captions before deciding whether SRT export is possible.
pub fn project_srt(project: &Project, captions: Option<&str>) -> Result<String, String> {
    let segments = crate::project::export_captions(project, captions)?;
    if segments.is_empty() {
        return Err("Brak napisów do eksportu".into());
    }
    to_srt(&segments)
}
fn timestamp(time: f64) -> String {
    let ms = (time * 1000.0).round() as u64;
    format!(
        "{:02}:{:02}:{:02},{:03}",
        ms / 3600000,
        (ms / 60000) % 60,
        (ms / 1000) % 60,
        ms % 1000
    )
}
pub fn to_srt(segments: &[Segment]) -> Result<String, String> {
    let mut out = String::new();
    let mut sorted: Vec<_> = segments.iter().collect();
    sorted.sort_by(|a, b| a.start.total_cmp(&b.start));
    for (i, s) in sorted.iter().enumerate() {
        if !s.start.is_finite() || !s.end.is_finite() || s.start < 0.0 || s.end <= s.start {
            return Err("Niepoprawne czasy napisów".into());
        }
        // Escape markup so recognised text is displayed literally by SRT players.
        let text = s
            .text
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('\r', "");
        let text = text
            .lines()
            .filter(|l| !l.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        out.push_str(&format!(
            "{}\r\n{} --> {}\r\n{}\r\n\r\n",
            i + 1,
            timestamp(s.start),
            timestamp(s.end),
            text.replace('\n', "\r\n")
        ));
    }
    Ok(out)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unicode_and_milliseconds() {
        let s = Segment {
            id: "1".into(),
            text: "Żółć <test>".into(),
            start: 1.25,
            end: 65.003,
            words: vec![],
            style_id: "default".into(),
        };
        let text = to_srt(&[s]).unwrap();
        assert!(text.contains("00:00:01,250 --> 00:01:05,003"));
        assert!(text.contains("Żółć &lt;test&gt;"));
    }
    fn timeline_project() -> Project {
        crate::project::parse(&serde_json::json!({"schemaVersion":10,"name":"SRT Łódź","media":{"path":"C:/Łódź/film.mp4","name":"Film","duration":8},"clips":[{"id":"c","start":0,"sourceIn":2,"sourceOut":6}],"segments":[],"timelineSegments":[{"id":"s","text":"Zażółć gęślą","start":1.25,"end":2.5,"words":[],"styleId":"default"}],"styles":{"default":{"fontFamily":"Arial","fontSize":42,"color":"#ffffff","background":"#000000","position":"bottom"}},"createdAt":"2026-10-18T00:00:00Z","updatedAt":"2026-10-18T00:00:00Z"}).to_string()).unwrap()
    }
    #[test]
    fn exports_composition_when_source_transcript_is_empty() {
        let p = timeline_project();
        assert!(p.segments.is_empty());
        let captions = serde_json::to_string(p.timeline_segments.as_ref().unwrap()).unwrap();
        let srt = project_srt(&p, Some(&captions)).unwrap();
        assert!(srt.contains("00:00:01,250 --> 00:00:02,500"));
        assert!(srt.contains("Zażółć gęślą"));
    }
    #[test]
    fn rejects_empty_hidden_and_out_of_montage_srt_before_dialog() {
        let mut p = timeline_project();
        assert!(project_srt(&p, Some("[]")).is_err());
        let captions = serde_json::to_string(p.timeline_segments.as_ref().unwrap()).unwrap();
        assert!(project_srt(&p, Some(&captions.replace("2.5", "5.5"))).is_err());
        p.tracks.captions.hidden = true;
        assert!(project_srt(&p, Some(&captions)).is_err());
    }
    #[test]
    fn timestamp_rollover() {
        assert_eq!(timestamp(59.9999), "00:01:00,000");
    }
}
