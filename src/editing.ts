import type { Project } from './model';
export type Clip = { id: string; sourceIn: number; sourceOut: number; start: number };
export const MIN_CLIP = 0.05;
export const clipEnd = (c: Clip) => c.start + c.sourceOut - c.sourceIn;
export const ordered = (clips: Clip[]) => [...clips].sort((a,b)=>a.start-b.start);
export function projectClips(p: Project): Clip[] {
  return p.clips ?? (p.media?.duration ? [{id:'original',sourceIn:0,sourceOut:p.media.duration,start:0}] : []);
}
export const editDuration = (p: Project) => Math.max(0,...projectClips(p).map(clipEnd));
export function clipAt(clips: Clip[], time: number) { return ordered(clips).find(c=>c.start<=time && time<clipEnd(c)); }
export function splitClip(clips: Clip[], id: string, time: number, newId:string=crypto.randomUUID()): Clip[] {
  const c=clips.find(x=>x.id===id); if(clips.length>=100 || !c || time-c.start<MIN_CLIP || clipEnd(c)-time<MIN_CLIP)return clips;
  const cut=c.sourceIn+time-c.start;
  return ordered(clips.flatMap(x=>x.id===id?[{...c,sourceOut:cut},{...c,id:newId,start:time,sourceIn:cut}]:[x]));
}
export function trimClip(clips: Clip[], id: string, edge:'left'|'right', delta:number, sourceDuration:number): Clip[] {
  const sorted=ordered(clips), i=sorted.findIndex(c=>c.id===id); if(i<0)return clips;
  const c=sorted[i], previous=i?clipEnd(sorted[i-1]):0, next=sorted[i+1]?.start??Infinity;
  if(edge==='left') {
    delta=Math.max(previous-c.start,-c.sourceIn,Math.min(delta,c.sourceOut-c.sourceIn-MIN_CLIP));
    return sorted.map(x=>x.id===id?{...c,start:c.start+delta,sourceIn:c.sourceIn+delta}:x);
  }
  delta=Math.max(MIN_CLIP-(c.sourceOut-c.sourceIn),Math.min(delta,sourceDuration-c.sourceOut,next-clipEnd(c)));
  return sorted.map(x=>x.id===id?{...c,sourceOut:c.sourceOut+delta}:x);
}
/** Find the nearest non-overlapping slot; magnetism is measured in screen pixels by the caller. */
export function moveClip(clips: Clip[],id:string,start:number,snapSeconds:number): Clip[] {
  const c=clips.find(x=>x.id===id); if(!c)return clips;
  const length=c.sourceOut-c.sourceIn, others=ordered(clips.filter(x=>x.id!==id));
  const slots=[0,...others.map(clipEnd)].map((lo,i)=>({lo,hi:(others[i]?.start??Infinity)-length})).filter(s=>s.hi>=s.lo-1e-8);
  const candidates=slots.map(s=>Math.max(s.lo,Math.min(start,s.hi)));
  start=candidates.reduce((a,b)=>Math.abs(b-start)<Math.abs(a-start)?b:a, candidates[0]??c.start);
  if(snapSeconds>0) {
    const magnets=[0,...others.flatMap(x=>[clipEnd(x),x.start-length])].filter(x=>x>=0 && others.every(o=>x+length<=o.start+1e-8||x>=clipEnd(o)-1e-8));
    const target=magnets.sort((a,b)=>Math.abs(a-start)-Math.abs(b-start))[0];
    if(target!==undefined && Math.abs(target-start)<=snapSeconds)start=target;
  }
  return ordered(clips.map(x=>x.id===id?{...c,start:Math.max(0,start)}:x));
}
export function closeGaps(clips: Clip[]): Clip[] {
  let time=0;return ordered(clips).map(c=>{const next={...c,start:time};time+=c.sourceOut-c.sourceIn;return next;});
}
export type EditedSegment = Project['segments'][number] & {sourceId:string;clipId:string};
export function compositionSegments(p: Project): EditedSegment[] {
  return ordered(projectClips(p)).flatMap(c=>p.segments.flatMap(s=>{
    const start=Math.max(c.sourceIn,s.start),end=Math.min(c.sourceOut,s.end);if(end<=start)return [];
    const offset=c.start-c.sourceIn;
    const words=s.words.filter(w=>w.start<end && w.end>start).map(w=>({...w,start:Math.max(start,w.start)+offset,end:Math.min(end,w.end)+offset}));
    // Without word timestamps, preserve the real segment text instead of guessing omitted words.
    const text=s.words.length?words.map(w=>w.text).join(' ').trim():s.text;
    if(!text)return [];
    return [{...s,id:JSON.stringify([c.id,s.id]),sourceId:s.id,clipId:c.id,start:start+offset,end:end+offset,text,words}];
  }));
}
export function compositionProject(p: Project): Project {
  return {...p,segments:compositionSegments(p).map(({sourceId:_,clipId:__,...s})=>s)};
}
