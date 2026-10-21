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
 if(source.text.length>100000)throw Error('Tekst źródłowy przekracza limit korekty. Podziel napis.');
 const duration=s.end-s.start,words=checkedWordDraft(rows,s.text,duration,Math.max(Math.abs(s.start),Math.abs(s.end))),e=p.captionEdits[s.id]??{trimStart:0,trimEnd:0};
 return {...p,captionEdits:{...p.captionEdits,[s.id]:{...e,text:s.text,textTiming:{mode,sourceText:source.text,duration,words}}}};
}
export function editCaption(p:Project,s:EditedSegment,patch:Partial<Project['captionEdits'][string]>):Project{
 if(p.tracks.T?.locked)throw Error('Ścieżka napisów jest zablokowana.');
 const previous=p.captionEdits[s.id]??{trimStart:0,trimEnd:0},next={...previous,...patch};
 if(patch.text!==undefined){
  const source=sourceCaption(p,s.id);delete next.textTiming;
  const timing=previous.textTiming,retimed=timing&&(timing.mode==='manual'||timing.mode==='reanalyzed'||timing.mode==='retained'),kept=retimed&&source&&timing.sourceText===source.text&&Math.abs(timing.duration-(s.end-s.start))<1e-7?inheritCaptionWords({...s,words:timing.words.map(w=>({...w,start:w.start+s.start,end:w.end+s.start}))},patch.text):null;
  if(timing?.mode==='board')next.textTiming={mode:'board'};
  else if(retimed&&kept)next.textTiming=patch.text===s.text?timing:{mode:'retained',origin:timing.mode==='retained'?timing.origin:timing.mode,sourceText:timing.sourceText,duration:s.end-s.start,...(timing.disabled!==undefined?{disabled:timing.disabled}:{}),words:kept.map(w=>({...w,start:w.start-s.start,end:w.end-s.start}))};
  else if(retimed&&timing.disabled)next.textTiming={mode:'board'};
  else if(source&&inheritCaptionWords(source,patch.text))next.textTiming={mode:'inherited',sourceText:source.text};
 }
 return {...p,captionEdits:{...p.captionEdits,[s.id]:next}};
}
export function canInheritCaption(p:Project,s:EditedSegment){const source=sourceCaption(p,s.id);return !!source&&!!inheritCaptionWords(source,s.text);}
export function setCaptionTiming(p:Project,s:EditedSegment,mode:'inherited'|'board'):Project{
 if(p.tracks.T?.locked)throw Error('Ścieżka napisów jest zablokowana.');
 const source=sourceCaption(p,s.id);if(mode==='inherited'&&(!source||!inheritCaptionWords(source,s.text)))throw Error('Brak jednoznacznego dopasowania 1:1. Pozostaw animację planszy.');
 const e=p.captionEdits[s.id]??{trimStart:0,trimEnd:0};return {...p,captionEdits:{...p.captionEdits,[s.id]:{...e,text:s.text,textTiming:mode==='board'?(e.textTiming&&'words' in e.textTiming?{...e.textTiming,disabled:true}:{mode}):{mode,sourceText:source!.text}}}};
}

export function restoreCaptionWords(p:Project,s:EditedSegment):Project{
 if(p.tracks.T?.locked)throw Error('Ścieżka napisów jest zablokowana.');
 const e=p.captionEdits[s.id],t=e?.textTiming;if(!t||!('words' in t)||!t.disabled)throw Error('Brak zachowanych czasów.');
 const next={...p,captionEdits:{...p.captionEdits,[s.id]:{...e,textTiming:{...t,disabled:false}}}};
 if(!compositionSegments(next).find(c=>c.id===s.id)?.words.length)throw Error('Podstawa czasów zmieniła się. Dopasuj napis ponownie.');return next;
}
export function canRestoreCaptionWords(p:Project,s:EditedSegment){try{restoreCaptionWords(p,s);return true;}catch{return false;}}

/** A selected group is hidden in one transaction, without altering raw transcripts. */
export function hideCaptions(p:Project,ids:readonly string[]):Project{
 if(p.tracks.T?.locked)throw Error('Ścieżka napisów jest zablokowana.');
 const selected=new Set(ids),edits={...p.captionEdits};let changed=false;
 for(const id of selected){edits[id]={...(edits[id]??{trimStart:0,trimEnd:0}),hidden:true};changed=true;}
 return changed?{...p,captionEdits:edits}:p;
}
export function resizeCaption(p:Project,s:EditedSegment,edge:'left'|'right',delta:number):Project{
 if(p.tracks.T?.locked)throw Error('Ścieżka napisów jest zablokowana.');
 if(!Number.isFinite(delta))throw Error('Nieprawidłowe przycięcie napisu.');
 const old=p.captionEdits[s.id]??{trimStart:0,trimEnd:0},length=s.end-s.start;
 if(delta===0)return p;
 const field=edge==='left'?'trimStart':'trimEnd',value=Math.max(0,Math.min(old[field]+(edge==='left'?delta:-delta),old[field]+Math.max(0,length-.05)));
 if(value===old[field])return p;
 const timing=old.textTiming?.mode==='manual'||old.textTiming?.mode==='reanalyzed'||old.textTiming?.mode==='retained'?{textTiming:undefined}:{};
 return editCaption(p,s,{...timing,[field]:value});
}

/** Translation keeps source/word identity and is committed as one edit after the gesture. */
export function moveCaption(p:Project,s:EditedSegment,delta:number):Project{
 if(p.tracks.T?.locked)throw Error('Ścieżka napisów jest zablokowana.');
 if(!Number.isFinite(delta))throw Error('Nieprawidłowe przesunięcie napisu.');
 const bounded=Math.max(-s.start,Math.min(delta,editDuration(p)-s.end));
 if(bounded===0)return p;
 return editCaption(p,s,{offset:(p.captionEdits[s.id]?.offset??0)+bounded});
}
