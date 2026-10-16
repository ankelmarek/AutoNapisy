import { useEffect, useMemo, useState, type RefObject } from "react";
import type { Project } from "./model";
import {
  captionCards,
  wrapCaption,
  activeCaption,
  type CaptionStyle,
} from "./captions";

type Rect = { left: number; top: number; width: number; height: number };
export function fitVideoRect(
  width: number,
  height: number,
  videoWidth: number,
  videoHeight: number,
): Rect {
  if (!width || !height || !videoWidth || !videoHeight)
    return { left: 0, top: 0, width: 0, height: 0 };
  const scale = Math.min(width / videoWidth, height / videoHeight),
    w = videoWidth * scale,
    h = videoHeight * scale;
  return { left: (width - w) / 2, top: (height - h) / 2, width: w, height: h };
}
export function CaptionBox({
  text,
  style,
  width,
  height,
}: {
  text: string;
  style: CaptionStyle;
  width: number;
  height: number;
}) {
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      document.fonts.ready,
      document.fonts.load(`24px "${style.fontFamily}"`),
    ])
      .then(() => {
        if (alive) setFontsReady((x) => x + 1);
      })
      .catch(() => {
        /* An unavailable custom font uses the local sans-serif fallback. */
      });
    return () => {
      alive = false;
    };
  }, [style.fontFamily]);
  const layout = useMemo(() => {
    const scale = width / 720,
      base = style.fontSize * scale;
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d");
    if (ctx) ctx.font = `${base}px "${style.fontFamily}"`;
    const measure = (s: string) =>
      ctx?.measureText(s).width ?? s.length * base * 0.6;
    const padding = Math.min(base * 0.55, width * 0.06),
      paddingY = Math.min(base * 0.4, height * 0.1),
      available = Math.max(1, (width * style.boxWidth) / 100 - padding * 2);
    const lines = wrapCaption(text, style, measure, available);
    const widest = Math.max(1, ...lines.map(measure));
    const fontScale = Math.min(
      1,
      available / widest,
      Math.max(1, height * 0.45 - paddingY * 2) / (base * lines.length * 1.04),
    );
    return {
      lines,
      fontSize: base * fontScale,
      paddingX: padding,
      paddingY,
      borderRadius: style.cornerRadius * scale,
    };
  }, [text, style, width, height, fontsReady]);
  return (
    <div
      className="caption-box"
      style={{
        fontFamily: `"${style.fontFamily}", sans-serif`,
        fontSize: layout.fontSize,
        color: style.color,
        background: style.background,
        padding: `${layout.paddingY}px ${layout.paddingX}px`,
        borderRadius: layout.borderRadius,
        maxWidth: `${style.boxWidth}%`,
      }}
    >
      {layout.lines.map((line, i) => (
        <div className="caption-line" key={i}>
          {line}
        </div>
      ))}
    </div>
  );
}
export default function CaptionOverlay({
  video,
  project,
  time,
}: {
  video: RefObject<HTMLVideoElement | null>;
  project: Project;
  time: number;
}) {
  const [rect, setRect] = useState<Rect>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const update = () =>
      setRect(
        fitVideoRect(
          element.clientWidth,
          element.clientHeight,
          element.videoWidth,
          element.videoHeight,
        ),
      );
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("loadedmetadata", update);
    element.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      element.removeEventListener("loadedmetadata", update);
      element.removeEventListener("resize", update);
    };
  }, [video, project.media?.path]);
  const cards = useMemo(
    () =>
      project.segments.flatMap((segment) =>
        captionCards(segment, project.styles[segment.styleId]),
      ),
    [project.segments, project.styles],
  );
  if (!rect.width) return null;
  const current = activeCaption(cards, time);
  return (
    <div className="caption-viewport" style={rect}>
      {(current ? [current] : []).map((card) => {
        const style = project.styles[card.styleId];
        const vertical =
          style.position === "bottom"
            ? { bottom: `${style.marginPercent}%` }
            : style.position === "top"
              ? { top: `${style.marginPercent}%` }
              : { top: "50%", transform: "translateY(-50%)" };
        return (
          <div className="caption-position" style={vertical} key={card.id}>
            <CaptionBox
              text={card.text}
              style={style}
              width={rect.width}
              height={rect.height}
            />
          </div>
        );
      })}
    </div>
  );
}
