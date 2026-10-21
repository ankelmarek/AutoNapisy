import type {Project} from './model';
import {compositionSegments,editDuration,type EditedSegment} from './editing';
import {inheritCaptionWords,captionAnchors,checkedWordDraft,type WordDraft} from './captionTiming';
export function sourceCaption(p:Project,id:string){
 const e=p.captionEdits[id];if(!e)return compositionSegments(p).find(s=>s.id===id);
 const {text:_,textTiming:__,...rest}=e;return compositionSegments({...p,captionEdits:{...p.captionEdits,[id]:rest}}).find(s=>s.id===id);
}
export function captionWordDraft(p:Project,s:EditedSegment):WordDraft[]{
 if(s.words.length)return s.words.map(w=>({...w,start:w.start-s.start,end:w.end-s.start,origin:p.captionEdits[s.id]?.textTiming?.mode==='reanalyzed'?'reanalyzed':p.captionEdits[s.id]?.textTiming?.mode==='manual'?'manual':'inherited'}));
 const source=sourceCaption(p,s.id);return source?captionAnchors(source,s.text):s.text.trim().split(/\s+/u).filter(Boolean).map(text=>({text}));
}
/** One deliberate transaction. Store only new timings relative to this caption;
 * never overwrite the raw source transcript or shift a repeated source instance. */
export function applyCaptionWords(p:Project,s:EditedSegment,rows:readonly WordDraft[],mode:'manual'|'reanalyzed'):Project{
 if(p.tracks.T?.locked)throw Error('Ścieżka napisów jest zablokowana.');
 const current=compositionSegments(p).find(c=>c.id===s.id),source=sourceCaption(p,s.id);
 if(!current||!source||current.text!==s.text||current.start!==s.start||current.end!==s.end)throw Error('Napis zmienił się. Otwórz dopasowanie ponownie.');
 const duration=s.end-s.start,words=checkedWordDraft(rows,s.text,duration),e=p.captionEdits[s.id]??{trimStart:0,trimEnd:0};
 return {...p,captionEdits:{...p.captionEdits,[s.id]:{...e,text:s.text,textTiming:{mode,sourceText:source.text,duration,words}}}};
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
 const timing=old.textTiming?.mode==='manual'||old.textTiming?.mode==='reanalyzed'?{textTiming:undefined}:{};
 if(edge==='left')return editCaption(p,s,{...timing,trimStart:Math.max(0,Math.min(old.trimStart+delta,old.trimStart+length-.05))});
 return editCaption(p,s,{...timing,trimEnd:Math.max(0,Math.min(old.trimEnd-delta,old.trimEnd+length-.05))});
}

/** Translation keeps source/word identity and is committed as one edit after the gesture. */
export function moveCaption(p:Project,s:EditedSegment,delta:number):Project{
 if(p.tracks.T?.locked)throw Error('Ścieżka napisów jest zablokowana.');
 if(!Number.isFinite(delta))throw Error('Nieprawidłowe przesunięcie napisu.');
 const bounded=Math.max(-s.start,Math.min(delta,editDuration(p)-s.end));
 return editCaption(p,s,{offset:(p.captionEdits[s.id]?.offset??0)+bounded});
}
