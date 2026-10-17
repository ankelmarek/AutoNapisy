import type {Project} from './model';
import {clipEnd,clipMedia,ordered,projectClips,type Clip} from './editing';
export type PlaybackRun=Clip & {clipIds:string[]};
/** A razor cut in continuous source material needs no new decoder or seek. */
export function playbackRuns(p:Project):PlaybackRun[]{
 const runs:PlaybackRun[]=[];
 for(const c of ordered(projectClips(p))){
  const previous=[...runs].reverse().find(r=>(r.track??0)===(c.track??0)&&(r.kind??'video')===(c.kind??'video'));
  if(previous&&previous.assetId===c.assetId&&Math.abs(clipEnd(previous)-c.start)<1e-6&&Math.abs(previous.sourceOut-c.sourceIn)<1e-6){previous.sourceOut=c.sourceOut;previous.clipIds.push(c.id);}
  else runs.push({...c,clipIds:[c.id]});
 }
 return runs;
}
export const playbackKey=(p:Project)=>JSON.stringify(projectClips(p).map(c=>[c.id,c.assetId,c.track,c.kind,c.start,c.sourceIn,c.sourceOut,clipMedia(p,c)?.path]));
export class PlaybackController{
 private project:Project;
 runs:PlaybackRun[];
 private pending=new Map<string,Promise<void>>();
 private revision=0;
 private volumePreview=new Map<string,{base:number;value:number}>();
 private time=0;
 constructor(project:Project,readonly elements:Map<string,HTMLMediaElement>,private onError:(message:string)=>void){this.project=project;this.runs=playbackRuns(project);}
 update(p:Project){this.project=p;this.runs=playbackRuns(p);for(const [id,preview] of this.volumePreview){const clip=projectClips(p).find(c=>c.id===id);if(!clip||(clip.volume??1)!==preview.base)this.volumePreview.delete(id);}}
 pause(){this.revision++;this.elements.forEach(v=>v.pause());}
 setVolume(clipId:string,value:number){const clip=projectClips(this.project).find(c=>c.id===clipId);if(!clip)return;value=Math.max(0,Math.min(1,value));if(value===(clip.volume??1))this.volumePreview.delete(clipId);else this.volumePreview.set(clipId,{base:clip.volume??1,value});const run=this.runs.find(r=>r.clipIds.includes(clipId)),el=run&&this.elements.get(run.id);if(el&&this.time>=clip.start&&this.time<clipEnd(clip))el.volume=value;}
 prepare(id:string,time:number){
  const run=this.runs.find(r=>r.id===id),el=this.elements.get(id);if(!run||!el||!Number.isFinite(el.duration)||el.seeking)return;
  const active=time>=run.start&&time<clipEnd(run),target=run.sourceIn+(active?time-run.start:0);
  if(Math.abs(el.currentTime-target)>.01)el.currentTime=Math.max(0,Math.min(target,el.duration-.001));
 }
 sync(time:number,playing:boolean,force=false){
  this.time=time;
  let waiting=false;
  for(const run of this.runs){
   const v=this.elements.get(run.id);if(!v)continue;
   const active=time>=run.start&&time<clipEnd(run);
   if(!active){
    if(!v.paused)v.pause();
    // Seek upcoming clips early, while their decoder can load the first frame quietly.
    if(run.start>=time&&run.start-time<=5)this.prepare(run.id,time);
    continue;
   }
   const clip=projectClips(this.project).find(c=>run.clipIds.includes(c.id)&&time>=c.start&&time<clipEnd(c));
   v.volume=(clip&&this.volumePreview.get(clip.id)?.value)??clip?.volume??1;
   const expected=run.sourceIn+Math.min(time-run.start,run.sourceOut-run.sourceIn-.001);
   if(Number.isFinite(v.duration)&&!v.seeking&&(v.ended||Math.abs(v.currentTime-expected)>(force?.005:.25)))v.currentTime=Math.max(0,Math.min(expected,v.duration-.001));
   if(v.seeking||v.readyState<2)waiting=true;
   if(playing&&v.paused&&!this.pending.has(run.id)){
    const revision=this.revision;
    const promise=v.play().then(()=>{if(this.revision!==revision)v.pause();}).catch(e=>{if(e instanceof DOMException&&e.name==='AbortError')return;if(this.revision===revision)this.onError(`Nie można odtworzyć „${clipMedia(this.project,run)?.name??'nagrania'}”: ${String(e)}`);}).finally(()=>this.pending.delete(run.id));
    this.pending.set(run.id,promise);
   }else if(!playing&&!v.paused)v.pause();
  }
  return waiting;
 }
}
