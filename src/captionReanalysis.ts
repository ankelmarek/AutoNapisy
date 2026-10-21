import {invoke} from '@tauri-apps/api/core';
import type {Project} from './model';
import type {EditedSegment} from './editing';
import type {TaskStatus} from './transcription';
import {captionTokens,captionTokenKey,checkedWordDraft,type WordDraft} from './captionTiming';
/** A strict content gate, not a confidence score or a forced aligner. No missing
 * word gets a timestamp; case and surrounding punctuation alone may differ. */
export function recognitionProposal(text:string,segments:Project['segments'],duration:number,clockMagnitude=duration):WordDraft[]{
 const target=captionTokens(text),words=segments.flatMap(s=>s.words);
 const recognized=captionTokens(segments.map(s=>s.text).join(' '));
 if(!target.length||target.length>256||recognized.length!==words.length||target.length!==words.length||target.some((t,i)=>!captionTokenKey(t)||captionTokenKey(t)!==captionTokenKey(words[i].text)||captionTokenKey(recognized[i])!==captionTokenKey(words[i].text)))throw Error('Whisper rozpoznał inną treść lub nie zwrócił wszystkich czasów. Nie dopisano brakujących słów. Ustaw czasy ręcznie albo pozostaw planszę.');
 return checkedWordDraft(words.map((w,i)=>({...w,text:target[i]})),text,duration,clockMagnitude).map(w=>({...w,origin:'reanalyzed'}));
}
export async function reanalyzeCaption(p:Project,s:EditedSegment,signal:AbortSignal,onStatus:(s:TaskStatus)=>void){
 if(signal.aborted)throw new DOMException('Anulowano','AbortError');
 const offset=p.captionEdits[s.id]?.offset??0;
 const {id,stamp}=await invoke<{id:number;stamp:string}>('start_caption_reanalysis',{json:JSON.stringify(p),captionId:s.id,from:s.start-offset,to:s.end-offset});
 let sent=false;const cancel=()=>{if(!sent){sent=true;void invoke('cancel_transcription',{id}).catch(()=>{sent=false;});}};
 signal.addEventListener('abort',cancel);
 try{for(;;){if(signal.aborted)cancel();const status=await invoke<TaskStatus>('transcription_status',{id});onStatus(status);
  if(status.state==='cancelled')throw new DOMException('Anulowano','AbortError');
  if(status.state==='failed')throw Error(status.message);
  if(status.state==='completed'){if(signal.aborted)throw new DOMException('Anulowano','AbortError');return {rows:recognitionProposal(s.text,status.segments??[],s.end-s.start,Math.max(Math.abs(s.start),Math.abs(s.end))),stamp};}
  await new Promise(resolve=>setTimeout(resolve,400));
 }}catch(e){cancel();throw e;}finally{signal.removeEventListener('abort',cancel);}
}
export async function validateCaptionSource(p:Project,s:EditedSegment,stamp:string){const offset=p.captionEdits[s.id]?.offset??0;await invoke('validate_caption_reanalysis',{json:JSON.stringify(p),captionId:s.id,from:s.start-offset,to:s.end-offset,stamp});}
