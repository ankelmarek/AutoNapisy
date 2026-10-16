import { wrapCaption, type CaptionStyle } from "./captions";
import type { Project } from "./model";
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
  const paddingX = Math.min(base * 0.55, width * 0.06),
    paddingY = Math.min(base * 0.4, height * 0.1);
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
    borderRadius: style.cornerRadius * scale,
    boxWidth: Math.max(0, ...lineWidths) + paddingX * 2,
    boxHeight: fontSize * 1.04 * lines.length + paddingY * 2,
  };
}
export async function ensureCaptionFonts(project: Project) {
  await Promise.all(
    Object.values(project.styles).map((style) =>
      document.fonts.load(`24px "${style.fontFamily}"`).catch(() => []),
    ),
  );
  await document.fonts.ready;
}
export function createFrameRenderer(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Brak obsługi Canvas");
  return async (text: string, style: CaptionStyle): Promise<string> => {
    const box = layoutCaption(text, style, width, height);
    ctx.clearRect(0, 0, width, height);
    const x = (width - box.boxWidth) / 2;
    const y =
      style.position === "top"
        ? (height * style.marginPercent) / 100
        : style.position === "center"
          ? (height - box.boxHeight) / 2
          : height * (1 - style.marginPercent / 100) - box.boxHeight;
    const radius = Math.max(
      0,
      Math.min(box.borderRadius, box.boxWidth / 2, box.boxHeight / 2),
    );
    ctx.fillStyle = style.background;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + box.boxWidth, y, x + box.boxWidth, y + box.boxHeight, radius);
    ctx.arcTo(
      x + box.boxWidth,
      y + box.boxHeight,
      x,
      y + box.boxHeight,
      radius,
    );
    ctx.arcTo(x, y + box.boxHeight, x, y, radius);
    ctx.arcTo(x, y, x + box.boxWidth, y, radius);
    ctx.closePath();
    ctx.fill();
    ctx.font = `${box.fontSize}px "${style.fontFamily}"`;
    ctx.fillStyle = style.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fontKerning = "normal";
    const metrics = ctx.measureText("Mg");
    const ascent = metrics.fontBoundingBoxAscent ?? box.fontSize * 0.8,
      descent = metrics.fontBoundingBoxDescent ?? box.fontSize * 0.2,
      lineHeight = box.fontSize * 1.04;
    const baseline =
      y + box.paddingY + (lineHeight - ascent - descent) / 2 + ascent;
    box.lines.forEach((line, i) =>
      ctx.fillText(line, width / 2, baseline + i * lineHeight),
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Nie można utworzyć planszy PNG")),
        "image/png",
      ),
    );
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("Nie można odczytać planszy"));
      reader.readAsDataURL(blob);
    });
    return data;
  };
}
