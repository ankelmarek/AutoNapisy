import {wrapCaption,type CaptionStyle} from "./captions";
/** Shared font metrics and layout for DOM preview and video bitmaps. */
export function layoutCaption(
  text: string,
  style: CaptionStyle,
  width: number,
  height: number,
) {
  const scale = width / 720,
    base = style.fontSize * scale;
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Nie można uruchomić renderowania plansz");
  ctx.font = `${base}px "${style.fontFamily}"`;
  const measure = (s: string) => ctx.measureText(s).width;
  const paddingX = Math.min(base * (style.effect==='highlight'?.25:.55), width * 0.06),
    paddingY = Math.min(base * (style.effect==='highlight'?.08:.4), height * 0.1);
  const available = Math.max(1, (width * style.boxWidth) / 100 - paddingX * 2);
  const lines = wrapCaption(text, style, measure, available),
    widest = Math.max(1, ...lines.map(measure));
  const fontScale = Math.min(
    1,
    available / widest,
    Math.max(1, height * 0.45 - paddingY * 2) /
      (base * Math.max(lines.length, 1) * 1.04),
  );
  const fontSize = base * fontScale;
  ctx.font = `${fontSize}px "${style.fontFamily}"`;
  const lineWidths = lines.map((s) => ctx.measureText(s).width);
  return {
    lines,
    fontSize,
    paddingX,
    paddingY,
    borderRadius: (style.effect==='highlight'?Math.min(6,style.cornerRadius):style.cornerRadius) * scale,
    boxWidth: Math.max(0, ...lineWidths) + paddingX * 2,
    boxHeight: fontSize * 1.04 * lines.length + paddingY * 2,
  };
}
