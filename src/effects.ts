import type {Project} from './model';
import {clipEnd,projectClips,ordered,type Clip} from './editing';
export type Transition=Project['transitions'][number];
export type {TransitionKind} from './transitionCatalog';
import type {TransitionKind} from './transitionCatalog';
export const neutral={brightness:1,contrast:1,saturation:1};
export const videoFilter=(c:Clip)=>{const a=c.adjustments??neutral;return `brightness(${a.brightness}) contrast(${a.contrast}) saturate(${a.saturation})`;};
export function presentationClips(p:Project):Clip[]{return projectClips(p).map(c=>{const t=p.transitions.find(t=>t.toId===c.id);return t?{...c,start:Math.max(0,c.start-t.duration),sourceIn:Math.max(0,c.sourceIn-t.duration)}:c;});}
export function transitionAt(p:Project,time:number){return p.transitions.find(t=>{const to=projectClips(p).find(c=>c.id===t.toId);return to&&time>=to.start-t.duration&&time<to.start;});}
export function transitionGain(p:Project,c:Clip,time:number){
 let gain=1;for(const t of p.transitions){const to=projectClips(p).find(c=>c.id===t.toId);if(!to||time<to.start-t.duration||time>=to.start)continue;const progress=(time-to.start+t.duration)/t.duration;if(t.fromId===c.id)gain*=1-progress;if(t.toId===c.id)gain*=progress;}return gain;
}
export function visuals(p:Project,time:number){
 const clips=presentationClips(p),active=clips.filter(c=>c.kind!=='audio'&&c.start<=time&&time<clipEnd(c)),track=Math.max(-1,...active.map(c=>c.track??0));
 const t=p.transitions.find(t=>{const to=clips.find(c=>c.id===t.toId);return to&&(to.track??0)===track&&time>=to.start&&time<to.start+t.duration;});
 if(t)return [{id:clips.find(c=>c.id===t.toId)!.id,translate:0,opacity:1}];
 const c=ordered(active).find(c=>(c.track??0)===track);return c?[{id:c.id,translate:0,opacity:1}]:[];
}
export function reconcileTransitions(p:Project,clips:Clip[]):Transition[]{return p.transitions.filter(t=>{const a=clips.find(c=>c.id===t.fromId),b=clips.find(c=>c.id===t.toId);return a&&b&&a.kind!=='audio'&&b.kind!=='audio'&&(a.track??0)===(b.track??0)&&Math.abs(clipEnd(a)-b.start)<1e-6&&b.sourceIn>=t.duration-1e-6&&a.sourceOut-a.sourceIn>=t.duration-1e-6;});}
/** Consume the incoming head, rendering it over the outgoing tail; no source handles are invented. */
export function applyTransition(p:Project,fromId:string,toId:string,kind:TransitionKind,duration:number):Project{
 const clips=projectClips(p),a=clips.find(c=>c.id===fromId),b=clips.find(c=>c.id===toId);if(!a||!b||a.kind==='audio'||b.kind==='audio'||(a.track??0)!==(b.track??0)||Math.abs(clipEnd(a)-b.start)>1e-6)throw Error('Przejście wymaga sąsiednich filmów na jednej ścieżce');
 const old=p.transitions.find(t=>t.toId===toId),oldDuration=old?.duration??0,max=Math.min(2,a.sourceOut-a.sourceIn,b.sourceOut-b.sourceIn+oldDuration-Math.max(.05,p.transitions.find(t=>t.fromId===b.id)?.duration??0));
 if(max<.1)throw Error('Fragmenty są za krótkie na przejście');duration=Math.max(.1,Math.min(max,duration));const delta=duration-oldDuration;
 const next=clips.map(c=>c.id===toId?{...c,sourceIn:Math.max(0,c.sourceIn+delta)}:c.start>=clipEnd(b)-1e-6&&c.kind!=='audio'&&(c.track??0)===(b.track??0)?{...c,start:c.start-delta}:c);
 return {...p,clips:next,transitions:[...p.transitions.filter(t=>t.toId!==toId),{id:old?.id??crypto.randomUUID(),fromId,toId,kind,duration}]};
}
export function removeTransition(p:Project,id:string):Project{
 const t=p.transitions.find(t=>t.id===id);if(!t)return p;const clips=projectClips(p),b=clips.find(c=>c.id===t.toId);if(!b)return {...p,transitions:p.transitions.filter(t=>t.id!==id)};
 return {...p,transitions:p.transitions.filter(t=>t.id!==id),clips:clips.map(c=>c.id===b.id?{...c,sourceIn:Math.max(0,c.sourceIn-t.duration)}:c.start>=clipEnd(b)-1e-6&&c.kind!=='audio'&&(c.track??0)===(b.track??0)?{...c,start:c.start+t.duration}:c)};
}
/** Draw the edit boundary at the middle of the actual overlap, so its badge spans both pictures. */
export function timelineClips(p:Project,clips:Clip[]=projectClips(p)):Clip[]{return clips.map(c=>{const incoming=p.transitions.find(t=>t.toId===c.id),outgoing=p.transitions.find(t=>t.fromId===c.id);return {...c,start:c.start-(incoming?.duration??0)/2,sourceIn:c.sourceIn-(incoming?.duration??0)/2,sourceOut:c.sourceOut-(outgoing?.duration??0)/2};});}
