import type {Project} from './model';
import {editDuration,type EditedSegment} from './editing';
export function editCaption(p:Project,s:EditedSegment,patch:Partial<Project['captionEdits'][string]>):Project{
 const previous=p.captionEdits[s.id]??{trimStart:0,trimEnd:0};return {...p,captionEdits:{...p.captionEdits,[s.id]:{...previous,...patch}}};
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
