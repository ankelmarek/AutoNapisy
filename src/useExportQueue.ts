import {uploadCaptionLayer,type CaptionUpload} from './captionLayer';
import {useCallback,useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {serializeProject,type Project} from './model';
import {captionExport} from './captions';
import {compositionProject} from './editing';
import {createFrameRenderer,ensureCaptionFonts} from './captionCanvas';
import {exportOptionsSchema,studioActive,type ExportOptions,type StudioItem} from './exportProfiles';
export function useExportQueue(){
 const [folder,setFolder]=useState<{id:number;path:string}|null>(null);
 const [items,setItems]=useState<StudioItem[]>([]),[error,setError]=useState(''),[preparing,setPreparing]=useState('');const controller=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{const rows=await invoke<StudioItem[]>('studio_status');setItems(rows);},[]);
 useEffect(()=>{let alive=true;const tick=async()=>{try{const rows=await invoke<StudioItem[]>('studio_status');if(alive)setItems(rows);}catch(e){if(alive)setError(String(e));}};void tick();const t=setInterval(()=>void tick(),800);return()=>{alive=false;clearInterval(t);controller.current?.abort();};},[]);
 const enqueue=async(projects:Project[],options:ExportOptions,folderId:number)=>{
  if(controller.current)return;exportOptionsSchema.parse(options);const abort=new AbortController();controller.current=abort;setError('');const errors:string[]=[];
  try{for(const project of projects){let id:number|null=null;const cancelCurrent=()=>{if(id!==null)void invoke('studio_cancel',{id}).catch(()=>{});};abort.signal.addEventListener('abort',cancelCurrent);try{
   if(abort.signal.aborted)break;setPreparing(project.name);const p=JSON.parse(serializeProject(project)) as Project;await ensureCaptionFonts(p);if(abort.signal.aborted)break;
   const snapshot=captionExport(compositionProject(p));const result=await invoke<{id:number;width:number;height:number;frames:number;animation?:CaptionUpload|null}>('studio_prepare',{json:serializeProject(p),captions:JSON.stringify(snapshot.segments),options,folderId});id=result.id;
   if(result.animation){await uploadCaptionLayer(snapshot,result.width,result.height,result.animation,abort.signal,n=>setPreparing(`${project.name} · napisy ${n}%`));}
   else if(options.captions==='burn'){
    if(result.frames!==snapshot.segments.length)throw Error('Niezgodna liczba plansz');const render=createFrameRenderer(result.width,result.height);
    for(let index=0;index<snapshot.segments.length;index++){if(abort.signal.aborted)throw new DOMException('Anulowano','AbortError');const segment=snapshot.segments[index],png=await render(segment.text,snapshot.styles[segment.styleId]);await invoke('studio_upload',{id,index,png});await new Promise(r=>setTimeout(r,0));}
   }
   if(abort.signal.aborted)throw new DOMException('Anulowano','AbortError');await invoke('studio_ready',{id});await refresh();
  }catch(e){if(id!==null)await invoke('studio_cancel',{id}).catch(()=>{});if(abort.signal.aborted)break;errors.push(`${project.name}: ${String(e)}`);}finally{abort.signal.removeEventListener('abort',cancelCurrent);}}
  }finally{controller.current=null;setPreparing('');setError(errors.join('\n'));await refresh().catch(()=>{});}
 };
 const action=async(command:'studio_cancel'|'studio_retry'|'studio_remove',id:number)=>{try{setError('');await invoke(command,{id});await refresh();}catch(e){setError(String(e));}};
 return {folder,setFolder,items,error,preparing,active:!!preparing||items.some(i=>studioActive(i.state)),enqueue,action,cancelPreparation:()=>controller.current?.abort()};
}
export type ExportQueue=ReturnType<typeof useExportQueue>;
