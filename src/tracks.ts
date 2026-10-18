import type {Project} from './model';
import {projectClips,type Clip} from './editing';
import {MAX_TRACKS,trackId,tracksOf,routedAudio,type TrackKind} from './trackModel';
import {reconcileTransitions} from './effects';
export function addTrack(p:Project,kind:TrackKind):Project{
 const used=tracksOf(p,kind).map(t=>t.index),index=Array.from({length:MAX_TRACKS},(_,i)=>i).find(i=>!used.includes(i));
 if(index===undefined)throw Error(`Maksymalnie ${MAX_TRACKS} ścieżek jednego typu.`);
 const id=trackId(kind,index);
 return {...p,trackLayout:[...p.trackLayout,{id,kind,index}],tracks:{...p.tracks,[id]:{ripple:'auto'}}};
}
export function removeTrack(p:Project,id:string,removeContents=false):Project{
 const t=p.trackLayout.find(t=>t.id===id);if(!t||t.index<2)throw Error('Podstawowe V1/V2 i A1/A2 pozostają w projekcie.');
 if(p.tracks[id]?.locked)throw Error('Odblokuj ścieżkę przed usunięciem.');
 const clips=projectClips(p);
 if(t.kind==='audio'&&clips.some(c=>c.kind!=='audio'&&!c.audioDetached&&routedAudio(c)===t.index))throw Error('Najpierw przekieruj lub odłącz dźwięk filmów korzystających z tej ścieżki.');
 const affected=(c:Clip)=>(c.kind==='audio'?'audio':'video')===t.kind&&(c.track??0)===t.index;
 if(clips.some(affected)&&!removeContents)throw Error('Ścieżka zawiera klipy. Potwierdź ich usunięcie.');
 const remaining=clips.filter(c=>!affected(c)),tracks={...p.tracks};delete tracks[id];
 return {...p,trackLayout:p.trackLayout.filter(t=>t.id!==id),tracks,clips:remaining,transitions:reconcileTransitions(p,remaining)};
}
export type Lane={id:string;index:number;kind:TrackKind|'captions';top:number;height:number;embedded:boolean;collapsed:boolean;split:boolean};
/** One geometry source for headers, hit testing, clips, joins, audio mirrors and scroll height. */
export function timelineLayout(p:Project,clips:Clip[]=projectClips(p),compact:ReadonlySet<string>=new Set(),tall:ReadonlySet<string>=new Set()):Lane[]{
 let top=28;const lanes:Lane[]=[{id:'T',kind:'captions',index:0,top,height:36,embedded:false,collapsed:false,split:false}];top+=36;
 for(const t of [...tracksOf(p,'video').reverse(),...tracksOf(p,'audio')]){
  const embedded=t.kind==='video'&&clips.some(c=>c.kind!=='audio'&&!c.audioDetached&&(c.track??0)===t.index&&routedAudio(c)===null),collapsed=compact.has(t.id),height=collapsed?28:t.kind==='video'?40+(embedded?56:0):tall.has(t.id)?112:56;
  lanes.push({...t,top,height,embedded,collapsed,split:t.kind==='audio'&&clips.some(c=>c.kind!=='audio'&&!c.audioDetached&&routedAudio(c)===t.index)});top+=height;
 }
 return lanes;
}
export const laneAt=(lanes:Lane[],y:number)=>lanes.find(t=>t.kind!=='captions'&&y>=t.top&&y<t.top+t.height);
export function clipLane(lanes:Lane[],c:Clip,mirror=false){const audio=mirror||c.kind==='audio',route=routedAudio(c);return lanes.find(t=>t.id===trackId(audio&&route!==null?'audio':'video',audio&&route!==null?route:c.track??0));}
export function clipTop(lanes:Lane[],c:Clip,mirror=false):number{
 const lane=clipLane(lanes,c,mirror);if(!lane)return -1000;
 return lane.top+3+(lane.collapsed?0:mirror&&routedAudio(c)===null?40:c.kind==='audio'&&lane.split?lane.height/2:0);
}
export function clipHeight(lanes:Lane[],c:Clip,mirror=false){const lane=clipLane(lanes,c,mirror);return !lane?0:lane.collapsed?22:mirror&&lane.embedded?lane.height-46:mirror||c.kind==='audio'?lane.height/(lane.split?2:1)-6:31;}
