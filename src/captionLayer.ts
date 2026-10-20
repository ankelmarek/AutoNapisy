import {invoke} from '@tauri-apps/api/core';
import {createAnimatedCaptionRenderer} from './animatedCaptionCanvas';
import {drawStaticCaption,ensureCaptionFonts} from './captionCanvas';
import {activeCaption,type CaptionCard,type CaptionStyle} from './captions';
import {captionFrameTime,hasCaptionMotion} from './captionAnimation';
import type {Project} from './model';
export type CaptionUpload={id:number;frames:number;start:number};
export function createCaptionLayerRenderer(canvas:HTMLCanvasElement){
 const animated=createAnimatedCaptionRenderer(canvas);let staticKey='',staticImage:HTMLCanvasElement|null=null;
 return (card:CaptionCard|null,style:CaptionStyle|null,time:number)=>{
  if(!card||!style||hasCaptionMotion(style)){staticKey='';return animated(card,style,time);}
  const key=JSON.stringify([card.text,style,canvas.width,canvas.height]);
  if(staticKey!==key){staticImage??=document.createElement('canvas');staticImage.width=canvas.width;staticImage.height=canvas.height;drawStaticCaption(staticImage,card.text,style);staticKey=key;}
  const ctx=canvas.getContext('2d')!;ctx.resetTransform();ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(staticImage!,0,0);
  return {fallback:false,active:-1};
 };
}
/** One binary frame in flight; no per-frame PNG files, base64 or unbounded promises. */
export async function uploadCaptionLayer(snapshot:Project,width:number,height:number,upload:CaptionUpload,signal?:AbortSignal,onProgress?:(n:number)=>void){
 const check=()=>{if(signal?.aborted)throw new DOMException('Anulowano eksport','AbortError');};
 check();await ensureCaptionFonts(snapshot);check();
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const draw=createCaptionLayerRenderer(canvas),ctx=canvas.getContext('2d',{willReadFrequently:true})!;
 try{for(let i=0;i<upload.frames;i++){
  check();const t=captionFrameTime(upload.start+i/30),card=activeCaption(snapshot.segments,t);draw(card,card?snapshot.styles[card.styleId]:null,t);
  const pixels=ctx.getImageData(0,0,width,height).data,packet=new Uint8Array(16+pixels.length),view=new DataView(packet.buffer);
  packet.set([82,86,67,49]);view.setBigUint64(4,BigInt(upload.id),true);view.setUint32(12,i,true);packet.set(pixels,16);
  check();await invoke('upload_caption_rgba',packet);onProgress?.(Math.round((i+1)*100/upload.frames));
  // Yield input/cancel delivery while retaining strict backpressure.
  await new Promise(r=>setTimeout(r,0));
 }}finally{canvas.width=canvas.height=1;}
}
