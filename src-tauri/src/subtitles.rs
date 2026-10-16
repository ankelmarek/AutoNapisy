use crate::project::Segment;
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
    #[test]
    fn timestamp_rollover() {
        assert_eq!(timestamp(59.9999), "00:01:00,000");
    }
}
