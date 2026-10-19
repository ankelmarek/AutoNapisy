import {invoke} from '@tauri-apps/api/core';
import {captionExport,activeCaption} from './captions';
import {compositionProject} from './editing';
import {createAnimatedCaptionRenderer} from './animatedCaptionCanvas';
import {ensureCaptionFonts} from './captionCanvas';
import {serializeProject,type Project} from './model';
export function pocProject(project:Project,preset:'karaoke-flow'|'pop-beat'){
 return {...project,styles:Object.fromEntries(Object.entries(project.styles).map(([id,s])=>[id,{...s,color:'#ffffff',effect:'outline' as const,outlineColor:'#080808',outlineWidth:3,fontFamily:'Bebas Neue',fontSize:60,animation:{preset,version:1 as const,accentColor:'#ffe600',speed:1,intensity:1}}]))};
}
export async function streamCaptionPoc(project:Project,start:number,duration:number,signal:AbortSignal,onProgress:(n:number)=>void){
 await ensureCaptionFonts(project);const snapshot=captionExport(compositionProject(project));let id:number|null=null;
 let cancelled=false;const cancel=()=>{if(id!==null&&!cancelled){cancelled=true;void invoke('caption_poc_cancel',{id}).catch(()=>{});}};
 const check=()=>{if(signal.aborted){cancel();throw new DOMException('Anulowano','AbortError');}};
 signal.addEventListener('abort',cancel);
 try{
  check();const r=await invoke<{id:number;width:number;height:number;start:number;duration:number;frames:number}>('caption_poc_begin',{json:serializeProject(project),captions:JSON.stringify(snapshot.segments),width:320,height:568,start,duration});id=r.id;check();
  const canvas=document.createElement('canvas');canvas.width=r.width;canvas.height=r.height;const draw=createAnimatedCaptionRenderer(canvas),ctx=canvas.getContext('2d')!;
  for(let i=0;i<r.frames;i++){
   check();const time=r.start+i/30,card=activeCaption(snapshot.segments,time);draw(card,card?snapshot.styles[card.styleId]:null,time);
   const pixels=ctx.getImageData(0,0,r.width,r.height).data,packet=new Uint8Array(16+pixels.length),view=new DataView(packet.buffer);packet.set([82,86,67,49]);view.setBigUint64(4,BigInt(r.id),true);view.setUint32(12,i,true);packet.set(pixels,16);
   await invoke('caption_poc_frame',packet);onProgress(Math.round((i+1)*100/r.frames));await new Promise(resolve=>setTimeout(resolve,0));
  }
  check();const path=await invoke<string>('caption_poc_finish',{id:r.id});check();return {...r,path,snapshot};
 }catch(e){if(id!==null)await invoke('caption_poc_cancel',{id}).catch(()=>{});throw e;}finally{signal.removeEventListener('abort',cancel);}
}
