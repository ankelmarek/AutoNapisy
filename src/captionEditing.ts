import type {Project} from './model';
import type {EditedSegment} from './editing';
export function editCaption(p:Project,s:EditedSegment,patch:Partial<Project['captionEdits'][string]>):Project{
 const previous=p.captionEdits[s.id]??{trimStart:0,trimEnd:0};return {...p,captionEdits:{...p.captionEdits,[s.id]:{...previous,...patch}}};
}
export function resizeCaption(p:Project,s:EditedSegment,edge:'left'|'right',delta:number):Project{
 const old=p.captionEdits[s.id]??{trimStart:0,trimEnd:0},length=s.end-s.start;
 if(edge==='left')return editCaption(p,s,{trimStart:Math.max(0,Math.min(old.trimStart+delta,old.trimStart+length-.05))});
 return editCaption(p,s,{trimEnd:Math.max(0,Math.min(old.trimEnd-delta,old.trimEnd+length-.05))});
}
