import {applyTimelineTranscript,projectSchema,type Project} from './model';
import {clipEnd,compositionSegments,editDuration,projectClips} from './editing';
import {clipMuted,videoTrack} from './trackControls';
export type Interval={start:number;end:number};
/** UI policy mirrors the backend; the backend alone authorizes and selects actual inputs. */
export function speechIntervals(p:Project,selected?:readonly string[]):Interval[]{
 const clips=projectClips(p),videos=clips.filter(c=>c.kind!=='audio'&&(!selected||selected.includes(c.id))&&!p.tracks[videoTrack(c)]?.muted),ranges:Interval[]=[];
 for(const v of videos){
  const incoming=p.transitions.find(t=>t.toId===v.id),candidates=v.audioDetached?clips.filter(a=>a.kind==='audio'&&!!v.syncGroup&&a.syncGroup===v.syncGroup&&(a.assetId??'')===(v.assetId??'')):[{...v,start:v.start-(incoming?.duration??0),sourceIn:v.sourceIn-(incoming?.duration??0)}];
  for(const c of candidates)if(!clipMuted(p,c)&&(c.volume??1)>0){const start=Math.max(0,c.start),end=Math.min(editDuration(p),clipEnd(c));if(end>start)ranges.push({start,end});}
 }
 const merged:Interval[]=[];for(const r of ranges.sort((a,b)=>a.start-b.start)){const last=merged.at(-1);if(last&&r.start<=last.end+1e-7)last.end=Math.max(last.end,r.end);else merged.push({...r});}return merged;
}
/** Replace only the requested intervals, preserving visible edits outside them. Wordless
 * captions crossing a boundary keep their text in each surviving part for manual review. */
export function applySelectedTranscript(p:Project,segments:Project['segments'],ranges:Interval[]):Project{
 const recognized=applyTimelineTranscript(p,segments).timelineSegments!;
 const outside=compositionSegments(p).flatMap((s,index)=>{
  let parts:Interval[]=[{start:s.start,end:s.end}];for(const r of ranges)parts=parts.flatMap(a=>r.end<=a.start||r.start>=a.end?[a]:[...(a.start<r.start?[{start:a.start,end:r.start}]:[]),...(a.end>r.end?[{start:r.end,end:a.end}]:[])]);
  return parts.filter(a=>a.end-a.start>=.05).map((a,i)=>{const words=s.words.filter(w=>w.start<a.end&&w.end>a.start).map(w=>({...w,start:Math.max(a.start,w.start),end:Math.min(a.end,w.end)}));return {id:`keep:${index}:${i}`,start:a.start,end:a.end,words,text:s.words.length?words.map(w=>w.text).join(' ').trim():s.text,styleId:s.styleId};}).filter(s=>s.text.trim());
 });
 const inside=recognized.flatMap((s,index)=>ranges.flatMap((r,i)=>{const start=Math.max(r.start,s.start),end=Math.min(r.end,s.end);if(end-start<.05)return [];const words=s.words.filter(w=>w.start<end&&w.end>start).map(w=>({...w,start:Math.max(start,w.start),end:Math.min(end,w.end)}));return [{...s,id:`new:${index}:${i}`,start,end,words,text:s.words.length?words.map(w=>w.text).join(' ').trim():s.text}];})).filter(s=>s.text.trim());
 return projectSchema.parse({...p,timelineSegments:[...outside,...inside].sort((a,b)=>a.start-b.start),captionEdits:{},updatedAt:new Date().toISOString()});
}
