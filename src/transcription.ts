import {invoke} from '@tauri-apps/api/core';
import type {Media} from './adapters';
import type {Project} from './model';
export type TaskStatus={id:number;state:'preparing'|'transcribing'|'cancelling'|'completed'|'failed'|'cancelled';message:string;progress:number|null;segments:Project['segments']|null;audioDuration:number|null};
export type Tools={ffmpeg:string|null;whisper:string|null;model:string|null};
export interface TranscriptionService {
 transcribe(media:Media,signal?:AbortSignal,onStatus?:(status:TaskStatus)=>void):Promise<Project['segments']>;
}
export const transcription:TranscriptionService={
 async transcribe(media,signal,onStatus){
  if(signal?.aborted)throw new DOMException('Anulowano','AbortError');
  const id=await invoke<number>('start_transcription',{path:media.path});
  let cancelSent=false;
  const cancel=()=>{if(!cancelSent){cancelSent=true;void invoke('cancel_transcription',{id}).catch(()=>{cancelSent=false;});}};
  signal?.addEventListener('abort',cancel);
  try{
   for(;;){
    if(signal?.aborted)cancel();
    const status=await invoke<TaskStatus>('transcription_status',{id});
    onStatus?.(status);
    if(status.state==='cancelled')throw new DOMException(status.message,'AbortError');
    if(status.state==='failed')throw new Error(status.message);
    if(status.state==='completed'){
     if(signal?.aborted)throw new DOMException('Anulowano','AbortError');
     if(!status.segments)throw new Error('Brak segmentów w zakończonym zadaniu');
     return status.segments;
    }
    await new Promise(resolve=>setTimeout(resolve,400));
   }
  }catch(error){cancel();throw error;}
  finally{signal?.removeEventListener('abort',cancel);}
 }
};
export const toolSettings={get:()=>invoke<Tools>('tool_settings'),choose:(kind:keyof Tools)=>invoke<Tools>('choose_component',{kind})};
