import { useEffect, useMemo, useState, type RefObject } from "react";
import type { Project } from "./model";
import { captionCards, activeCaption, type CaptionStyle } from "./captions";

import { layoutCaption } from "./captionCanvas";
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
  const layout = useMemo(
    () => layoutCaption(text, style, width, height),
    [text, style, width, height, fontsReady],
  );
  return (
    <div
      className="caption-box"
      style={{
        fontFamily: `"${style.fontFamily}", sans-serif`,
        fontSize: layout.fontSize,
        color: style.color,
        background: style.effect==='outline'?'transparent':style.background,
        WebkitTextStroke: `${(style.outlineWidth??(style.effect==='outline'?3:0))*width/720}px ${style.outlineColor??'#080808'}`,
        paintOrder:'stroke fill', 
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
  compositionCanvas=false,
}: {
  video: RefObject<HTMLVideoElement | HTMLDivElement | null>;
  project: Project;
  time: number;
  compositionCanvas?:boolean;
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
          compositionCanvas||!(element instanceof HTMLVideoElement)?element.clientWidth:element.videoWidth,
          compositionCanvas||!(element instanceof HTMLVideoElement)?element.clientHeight:element.videoHeight,
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
  }, [video, project.media?.path, project.clips]);
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
