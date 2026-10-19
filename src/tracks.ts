import type {Project} from './model';
import {projectClips,type Clip} from './editing';
import {MAX_TRACKS,trackId,tracksOf,routedAudio,type TrackKind} from './trackModel';
import {audioRows,freeAudioTrack} from './audioLayout';
import {clipLocked} from './trackControls';
import {boundedHeight} from './timelineView';
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
export type Lane={id:string;index:number;kind:TrackKind|'captions';top:number;height:number;embedded:boolean;collapsed:boolean;rows:Record<string,number>;rowCount:number};
/** Geometry is independent of bus routing. Only independent audio clips occupy A lanes. */
export function timelineLayout(p:Project,clips:Clip[]=projectClips(p),compact:ReadonlySet<string>=new Set(),tall:ReadonlySet<string>=new Set(),heights:Readonly<Record<string,number>>={}):Lane[]{
 let top=28;const lanes:Lane[]=[{id:'T',kind:'captions',index:0,top,height:36,embedded:false,collapsed:false,rows:{},rowCount:1}];top+=36;
 for(const t of [...tracksOf(p,'video').reverse(),...tracksOf(p,'audio')]){
  const embedded=t.kind==='video'&&clips.some(c=>c.kind!=='audio'&&!c.audioDetached&&(c.track??0)===t.index),collapsed=compact.has(t.id),rows=t.kind==='audio'?audioRows(clips,t.index):{},rowCount=Math.max(1,...Object.values(rows).map(row=>row+1));
  const height=t.kind==='video'?(collapsed?28:boundedHeight(t.kind,heights[t.id]??(embedded?84:40),embedded)):rowCount*(collapsed?28:boundedHeight(t.kind,heights[t.id]??(tall.has(t.id)?112:56)));
  lanes.push({...t,top,height,embedded,collapsed,rows,rowCount});top+=height;
 }
 return lanes;
}
export const laneAt=(lanes:Lane[],y:number)=>lanes.find(t=>t.kind!=='captions'&&y>=t.top&&y<t.top+t.height);
export function clipLane(lanes:Lane[],c:Clip){return lanes.find(t=>t.id===trackId(c.kind==='audio'?'audio':'video',c.track??0));}
export function clipTop(lanes:Lane[],c:Clip):number{const lane=clipLane(lanes,c);return !lane?-1000:lane.top+3+(c.kind==='audio'?(lane.rows[c.id]??0):0)*lane.height/lane.rowCount;}
export function clipHeight(lanes:Lane[],c:Clip){const lane=clipLane(lanes,c);return !lane?0:lane.collapsed?22:c.kind==='audio'?lane.height/lane.rowCount-6:lane.height-6;}
/** Explicitly chosen separation is one project edit. Existing projects are never moved by layout. */
export function separateAudio(p:Project,id:string):Project{
 const clips=projectClips(p),c=clips.find(c=>c.id===id);if(!c||c.kind!=='audio')throw Error('Wybierz klip audio.');if(clipLocked(p,c))throw Error('Odblokuj ścieżkę audio.');
 const target=freeAudioTrack(p,clips,c);if(!target)throw Error('Brak wolnej ścieżki audio (maksymalnie 16).');
 const next=target.create?addTrack(p,'audio'):p;
 return {...next,clips:clips.map(x=>x.id===id?{...x,track:target.index}:x)};
}

/** Move in displayed order; crossing a locked track is an edit conflict. */
export function reorderTrack(p:Project,id:string,target:string,after=false):Project{
 const t=p.trackLayout.find(t=>t.id===id),to=p.trackLayout.find(t=>t.id===target);
 if(!t||!to||t.kind!==to.kind)throw Error('Przenoś ścieżki w obrębie tego samego typu.');
 if(id===target)return p;
 const displayed=tracksOf(p,t.kind);if(t.kind==='video')displayed.reverse();
 const from=displayed.findIndex(x=>x.id===id),at=displayed.findIndex(x=>x.id===target);
 if(displayed.slice(Math.min(from,at),Math.max(from,at)+1).some(x=>p.tracks[x.id]?.locked))throw Error('Odblokuj ścieżki przed zmianą ich kolejności.');
 const rest=displayed.filter(x=>x.id!==id),pos=rest.findIndex(x=>x.id===target)+(after?1:0);rest.splice(pos,0,t);
 if(t.kind==='video')rest.reverse();let i=0;
 return {...p,trackLayout:p.trackLayout.map(x=>x.kind===t.kind?rest[i++]:x)};
}
