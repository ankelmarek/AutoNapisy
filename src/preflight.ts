import type {Project} from './model';
import type {SourceInfo} from './sourceReplacement';
import {libraryItems} from './library';
import {projectClips,editDuration,clipEnd} from './editing';
import {presentationClips} from './effects';
import {videoHidden} from './trackControls';
export type SourceCheck={id:string;available:boolean;error:string;info:SourceInfo|null};
export type PreflightIssue={severity:'error'|'warning';kind?:'caption'|'audio'|'black';message:string;time?:number;end?:number;sourceId?:string};
/** Structural checks only: a gap is uncovered picture, not measured black pixels. */
export function preflightIssues(p:Project,checks:SourceCheck[]):PreflightIssue[]{
 const clips=projectClips(p),issues:PreflightIssue[]=[];
 for(const item of libraryItems(p)){
  const uses=clips.filter(c=>(c.assetId??'primary')===item.id),check=checks.find(c=>c.id===item.id),time=uses.length?Math.min(...uses.map(c=>c.start)):undefined;
  if(!check?.available||check.error){issues.push({severity:'error',sourceId:item.id,time,message:`${item.name}: ${check?.error||'Nie można odczytać źródła.'}${!uses.length?' Plik poza montażem.':''}`});continue;}
  const info=check.info;if(!info)continue;
  for(const c of uses){
   if(c.sourceOut>info.duration+1e-6)issues.push({severity:'error',sourceId:item.id,time:c.start,message:`${item.name}: ujęcie wymaga ${c.sourceOut.toFixed(3)} s źródła, plik ma ${info.duration.toFixed(3)} s.`});
   if(c.kind!=='audio'&&!info.videoStreams||c.kind==='audio'&&!info.audioStreams)issues.push({severity:'error',sourceId:item.id,time:c.start,message:`${item.name}: brak strumienia wymaganego przez ujęcie.`});
  }
 }
 const pictures=presentationClips(p).filter(c=>c.kind!=='audio'&&!videoHidden(p,c)).sort((a,b)=>a.start-b.start);
 let covered=0;
 for(const c of pictures){if(c.start-covered>1/30+1e-6)issues.push({severity:'warning',time:covered,end:c.start,message:'Przerwa bez widocznego filmu. Może być zamierzona.'});covered=Math.max(covered,clipEnd(c));}
 if(editDuration(p)-covered>1/30+1e-6)issues.push({severity:'warning',time:covered,end:editDuration(p),message:'Końcówka montażu bez widocznego filmu. Może być zamierzona.'});
 return issues.sort((a,b)=>a.severity===b.severity?(a.time??Infinity)-(b.time??Infinity):a.severity==='error'?-1:1);
}
