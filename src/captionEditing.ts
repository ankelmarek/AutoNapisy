import type {Project} from './model';
import {compositionSegments,editDuration,type EditedSegment} from './editing';
import {inheritCaptionWords} from './captionTiming';
function sourceCaption(p:Project,id:string){
 const e=p.captionEdits[id];if(!e)return compositionSegments(p).find(s=>s.id===id);
 const {text:_,textTiming:__,...rest}=e;return compositionSegments({...p,captionEdits:{...p.captionEdits,[id]:rest}}).find(s=>s.id===id);
}
export function editCaption(p:Project,s:EditedSegment,patch:Partial<Project['captionEdits'][string]>):Project{
 if(p.tracks.T?.locked)throw Error('Ścieżka napisów jest zablokowana.');
 const previous=p.captionEdits[s.id]??{trimStart:0,trimEnd:0},next={...previous,...patch};
 if(patch.text!==undefined){
  const source=sourceCaption(p,s.id);delete next.textTiming;
  if(previous.textTiming?.mode==='board')next.textTiming={mode:'board'};
  else if(source&&inheritCaptionWords(source,patch.text))next.textTiming={mode:'inherited',sourceText:source.text};
 }
 return {...p,captionEdits:{...p.captionEdits,[s.id]:next}};
}
export function canInheritCaption(p:Project,s:EditedSegment){const source=sourceCaption(p,s.id);return !!source&&!!inheritCaptionWords(source,s.text);}
export function setCaptionTiming(p:Project,s:EditedSegment,mode:'inherited'|'board'):Project{
 if(p.tracks.T?.locked)throw Error('Ścieżka napisów jest zablokowana.');
 const source=sourceCaption(p,s.id);if(mode==='inherited'&&(!source||!inheritCaptionWords(source,s.text)))throw Error('Brak jednoznacznego dopasowania 1:1. Pozostaw animację planszy.');
 const e=p.captionEdits[s.id]??{trimStart:0,trimEnd:0};return {...p,captionEdits:{...p.captionEdits,[s.id]:{...e,text:s.text,textTiming:mode==='board'?{mode}:{mode,sourceText:source!.text}}}};
}
/** A selected group is hidden in one transaction, without altering raw transcripts. */
export function hideCaptions(p:Project,ids:readonly string[]):Project{
 if(p.tracks.T?.locked)throw Error('Ścieżka napisów jest zablokowana.');
 const selected=new Set(ids),edits={...p.captionEdits};let changed=false;
 for(const id of selected){edits[id]={...(edits[id]??{trimStart:0,trimEnd:0}),hidden:true};changed=true;}
 return changed?{...p,captionEdits:edits}:p;
}
export function resizeCaption(p:Project,s:EditedSegment,edge:'left'|'right',delta:number):Project{
 const old=p.captionEdits[s.id]??{trimStart:0,trimEnd:0},length=s.end-s.start;
 if(edge==='left')return editCaption(p,s,{trimStart:Math.max(0,Math.min(old.trimStart+delta,old.trimStart+length-.05))});
 return editCaption(p,s,{trimEnd:Math.max(0,Math.min(old.trimEnd-delta,old.trimEnd+length-.05))});
}

/** Translation keeps source/word identity and is committed as one edit after the gesture. */
export function moveCaption(p:Project,s:EditedSegment,delta:number):Project{
 if(p.tracks.T?.locked)throw Error('Ścieżka napisów jest zablokowana.');
 if(!Number.isFinite(delta))throw Error('Nieprawidłowe przesunięcie napisu.');
 const bounded=Math.max(-s.start,Math.min(delta,editDuration(p)-s.end));
 return editCaption(p,s,{offset:(p.captionEdits[s.id]?.offset??0)+bounded});
}
