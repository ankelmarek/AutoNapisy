import {captionFontFamily,inspectCaptionFont} from './captionFonts';
import type {CaptionStyle} from "./captions";
import {layoutCaption} from "./captionLayout";
export {layoutCaption} from "./captionLayout";
import {createAnimatedCaptionRenderer} from "./animatedCaptionCanvas";
import type { Project } from "./model";
export async function ensureCaptionFonts(project: Project) {
  await Promise.all([...new Set(Object.values(project.styles).map(s=>s.fontFamily))].map(inspectCaptionFont));
}
export function createFrameRenderer(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Brak obsługi Canvas");
  return async (text: string, style: CaptionStyle): Promise<string> => {
    drawStaticCaption(canvas,text,style);
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

/** Exact legacy bitmap layout, reused for static cards inside animated video layers. */
export function drawStaticCaption(canvas:HTMLCanvasElement,text:string,style:CaptionStyle){
 if(style.animation?.enabled===false){createAnimatedCaptionRenderer(canvas)({id:'frozen',text,start:0,end:1,styleId:'frozen'},style,0);return;}
 const {width,height}=canvas,ctx=canvas.getContext('2d');if(!ctx)throw Error('Brak obsługi Canvas');
 ctx.resetTransform();ctx.globalAlpha=1;ctx.shadowBlur=0;
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
    if(style.effect!=='outline')ctx.fill();
    ctx.font = `${box.fontSize}px ${captionFontFamily(style.fontFamily)}`;
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
    box.lines.forEach((line,i)=>{
      const stroke=(style.outlineWidth??(style.effect==='outline'?3:0))*width/720;
      if(stroke>0){ctx.strokeStyle=style.outlineColor??'#080808';ctx.lineWidth=stroke;ctx.lineJoin='round';ctx.strokeText(line,width/2,baseline+i*lineHeight);}
      ctx.fillText(line,width/2,baseline+i*lineHeight);
    });
}
