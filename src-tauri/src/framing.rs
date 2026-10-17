use crate::{
    project::{Clip, Project},
    rendering::Metadata,
};
pub fn apply_canvas(p: &Project, meta: &mut Metadata) {
    if let Some(c) = &p.canvas {
        meta.width = c.width;
        meta.height = c.height;
    }
}
pub fn rect(c: &Clip, width: u32, height: u32) -> (f64, f64, f64, f64) {
    let (scale, x, y) = c
        .transform
        .as_ref()
        .map(|t| (t.scale, t.x, t.y))
        .unwrap_or((1., 0., 0.));
    (
        width as f64 * ((1. - scale) / 2. + x),
        height as f64 * ((1. - scale) / 2. + y),
        width as f64 * scale,
        height as f64 * scale,
    )
}
pub fn geometry(c: &Clip, width: u32, height: u32) -> String {
    let (x, y, w, h) = rect(c, width, height);
    format!("0={x}/{y}:{w}x{h}:100")
}
/// Place an already fitted picture on a fixed black canvas, for FFmpeg xfade.
/// Numeric arguments originate only from the validated project model.
pub fn ffmpeg_chain(c: &Clip, width: u32, height: u32, input: &str, out: &str) -> String {
    let (x, y, w, h) = rect(c, width, height);
    let w = (w / 2.).round().max(1.) as u32 * 2;
    let h = (h / 2.).round().max(1.) as u32 * 2;
    format!("[{input}]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[{out}scaled];color=c=black:s={width}x{height}:r=30[{out}black];[{out}black][{out}scaled]overlay=x={x}:y={y}:shortest=1,format=yuv420p[{out}];")
}
