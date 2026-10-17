import type { Project } from './model';
import {presentationClips} from './effects';
export type Clip = { id: string; sourceIn: number; sourceOut: number; start: number; assetId?: string; track?: 0|1; kind?: "video"|"audio"; volume?: number; adjustments?: {brightness:number;contrast:number;saturation:number} };
export const MIN_CLIP = 0.05;
export const clipEnd = (c: Clip) => c.start + c.sourceOut - c.sourceIn;
export const ordered = (clips: Clip[]) => [...clips].sort((a,b)=>a.start-b.start);
export function projectClips(p: Project): Clip[] {
  return p.clips ?? (p.media?.duration ? [{id:'original',sourceIn:0,sourceOut:p.media.duration,start:0}] : []);
}
export const editDuration = (p: Project) => Math.max(0,...projectClips(p).map(clipEnd));
export const clipMedia=(p:Project,c:Clip)=>c.assetId?p.assets.find(a=>a.id===c.assetId):p.media;
export const lane=(c:Clip)=>`${c.kind??'video'}:${c.track??0}`;
export function clipAt(clips: Clip[], time: number) { return ordered(clips).filter(c=>c.kind!=='audio'&&c.start<=time && time<clipEnd(c)).sort((a,b)=>(b.track??0)-(a.track??0))[0]; }
export function laneClips(clips:Clip[],c:Clip){return clips.filter(x=>lane(x)===lane(c));}
export function changeTrack(clips:Clip[],id:string,track:0|1){const c=clips.find(x=>x.id===id);if(!c)return clips;if(c.kind!=='audio'&&clips.some(x=>x.id!==id&&x.kind!=='audio'&&(x.track??0)===track&&x.start<clipEnd(c)-1e-6&&clipEnd(x)>c.start+1e-6))return clips;return clips.map(x=>x.id===id?{...x,track}:x);}
export function appendMedia(p:Project,media:{path:string;name:string;duration:number},kind:'video'|'audio',at:number):Project {
 const first=!p.media&&kind==='video',id=crypto.randomUUID(),clips=projectClips(p),length=media.duration;
 if(length<.05||length>86400||clips.length>=100||p.assets.length>=100)throw new Error('Przekroczono limit projektu lub nieprawidłowy czas pliku');
 let track:0|1=0,start=Math.max(0,at);
 if(kind==='video'){
  const free=(t:number)=>clips.every(c=>c.kind==='audio'||(c.track??0)!==t||clipEnd(c)<=start||c.start>=start+length);
  if(!free(0)){if(free(1))track=1;else start=Math.max(0,...clips.filter(c=>c.kind!=='audio'&&(c.track??0)===0).map(clipEnd));}
 }else if(clips.some(c=>(c.track??0)===0&&c.start<=start&&clipEnd(c)>start))track=1;
 if(start+length>86400)throw new Error('Montaż może trwać najwyżej 24 godziny');
 return {...p,media:first?media:p.media,assets:first?p.assets:[...p.assets,{...media,id,kind,segments:[]}],clips:[...clips,{id:crypto.randomUUID(),sourceIn:0,sourceOut:length,start,track,kind,...(first?{}:{assetId:id})}]};
}
export function splitClip(clips: Clip[], id: string, time: number, newId:string=crypto.randomUUID()): Clip[] {
  const c=clips.find(x=>x.id===id); if(clips.length>=100 || !c || time-c.start<MIN_CLIP || clipEnd(c)-time<MIN_CLIP)return clips;
  const cut=c.sourceIn+time-c.start;
  return ordered(clips.flatMap(x=>x.id===id?[{...c,sourceOut:cut},{...c,id:newId,start:time,sourceIn:cut}]:[x]));
}
export function trimClip(clips: Clip[], id: string, edge:'left'|'right', delta:number, sourceDuration:number): Clip[] {
  const selected=clips.find(c=>c.id===id);if(!selected)return clips;
  const sorted=ordered(laneClips(clips,selected)), i=sorted.findIndex(c=>c.id===id); if(i<0)return clips;
  const c=sorted[i], previous=c.kind==='audio'?0:i?clipEnd(sorted[i-1]):0, next=c.kind==='audio'?Infinity:sorted[i+1]?.start??Infinity;
  if(edge==='left') {
    delta=Math.max(previous-c.start,-c.sourceIn,Math.min(delta,c.sourceOut-c.sourceIn-MIN_CLIP));
    return clips.map(x=>x.id===id?{...c,start:c.start+delta,sourceIn:c.sourceIn+delta}:x);
  }
  delta=Math.max(MIN_CLIP-(c.sourceOut-c.sourceIn),Math.min(delta,sourceDuration-c.sourceOut,next-clipEnd(c),86400-clipEnd(c)));
  return clips.map(x=>x.id===id?{...c,sourceOut:c.sourceOut+delta}:x);
}
/** Find the nearest non-overlapping slot; magnetism is measured in screen pixels by the caller. */
export function moveClip(clips: Clip[],id:string,start:number,snapSeconds:number): Clip[] {
  const c=clips.find(x=>x.id===id); if(!c)return clips;
  const length=c.sourceOut-c.sourceIn, others=ordered(clips.filter(x=>x.id!==id && lane(x)===lane(c) && c.kind!=='audio'));
  const slots=[0,...others.map(clipEnd)].map((lo,i)=>({lo,hi:(others[i]?.start??Infinity)-length})).filter(s=>s.hi>=s.lo-1e-8);
  const candidates=slots.map(s=>Math.max(s.lo,Math.min(start,s.hi)));
  start=candidates.reduce((a,b)=>Math.abs(b-start)<Math.abs(a-start)?b:a, candidates[0]??c.start);
  if(snapSeconds>0) {
    const magnets=[0,...clips.filter(x=>x.id!==id).flatMap(x=>[clipEnd(x),x.start-length])].filter(x=>x>=0 && others.every(o=>x+length<=o.start+1e-8||x>=clipEnd(o)-1e-8));
    const target=magnets.sort((a,b)=>Math.abs(a-start)-Math.abs(b-start))[0];
    if(target!==undefined && Math.abs(target-start)<=snapSeconds)start=target;
  }
  return ordered(clips.map(x=>x.id===id?{...c,start:Math.max(0,Math.min(86400-length,start))}:x));
}
export function closeGaps(clips: Clip[]): Clip[] {
  const times=new Map<string,number>();return ordered(clips).map(c=>{const key=lane(c),time=times.get(key)??0;times.set(key,time+c.sourceOut-c.sourceIn);return {...c,start:time};});
}
export type EditedSegment = Project['segments'][number] & {sourceId:string;clipId:string;assetId?:string};
export function compositionSegments(p: Project): EditedSegment[] {
  const clips=presentationClips(p);
  const total=editDuration(p);
  const timeline=p.timelineSegments?.filter(s=>s.start<total).map(s=>({...s,end:Math.min(s.end,total),words:s.words.filter(w=>w.start<total).map(w=>({...w,end:Math.min(w.end,total)})),id:'timeline:'+s.id,sourceId:s.id,clipId:''}));
  return (timeline??ordered(clips).filter(c=>c.kind!=='audio').flatMap(c=>{
    const incoming=p.transitions.find(t=>t.toId===c.id),outgoing=p.transitions.find(t=>t.fromId===c.id),next=outgoing?projectClips(p).find(x=>x.id===outgoing.toId):undefined;
    let ranges=[{start:c.start+(incoming?incoming.duration/2:0),end:next?next.start-outgoing!.duration/2:clipEnd(c)}];
    for(const upper of clips.filter(u=>u.kind!=='audio'&&(u.track??0)>(c.track??0)))ranges=ranges.flatMap(r=>{
      if(upper.start>=r.end||clipEnd(upper)<=r.start)return [r];
      return [...(upper.start>r.start?[{start:r.start,end:upper.start}]:[]),...(clipEnd(upper)<r.end?[{start:clipEnd(upper),end:r.end}]:[])];
    });
    return ranges.flatMap((range,index)=>(c.assetId?p.assets.find(a=>a.id===c.assetId)?.segments??[]:p.segments).flatMap(s=>{
      const offset=c.start-c.sourceIn,start=Math.max(c.sourceIn,s.start,range.start-offset),end=Math.min(c.sourceOut,s.end,range.end-offset);if(end<=start)return [];
      const words=s.words.filter(w=>w.start<end&&w.end>start).map(w=>({...w,start:Math.max(start,w.start)+offset,end:Math.min(end,w.end)+offset}));
      const text=s.words.length?words.map(w=>w.text).join(' ').trim():s.text;if(!text)return [];
      return [{...s,id:JSON.stringify([c.id,s.id,index]),sourceId:s.id,clipId:c.id,assetId:c.assetId,start:start+offset,end:end+offset,text,words}];
    }));
  })).flatMap(s=>{
    const patch=p.captionEdits[s.id];if(!patch)return [s];if(patch.hidden)return [];
    const start=s.start+patch.trimStart,end=s.end-patch.trimEnd;if(end-start<.049999)return [];
    const words=patch.text!==undefined||patch.trimStart>0||patch.trimEnd>0?[]:s.words;
    return [{...s,start,end,words,text:patch.text??s.text}];
  });
}

export function compositionProject(p: Project): Project {
  return {...p,segments:compositionSegments(p).map(({sourceId:_,clipId:__,assetId:___,...s})=>s)};
}
