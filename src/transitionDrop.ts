import type {Clip} from './editing';
import {clipEnd} from './editing';
import type {Lane} from './tracks';
import {laneAt} from './tracks';
/** Pointer coordinates are relative to the timeline canvas; accept a generous seam zone, never another V lane. */
export function transitionDropTarget(clips:Clip[],lanes:Lane[],x:number,y:number,zoom:number,transitions:{fromId:string;toId:string;duration:number}[]=[]){
 const lane=laneAt(lanes,y);if(!lane||lane.kind!=='video'||!Number.isFinite(zoom)||zoom<=0)return null;
 return clips.filter(a=>a.kind!=='audio'&&(a.track??0)===lane.index).flatMap(a=>{const b=clips.find(b=>b.id!==a.id&&b.kind!=='audio'&&(b.track??0)===lane.index&&Math.abs(clipEnd(a)-b.start)<1e-6);const duration=b?transitions.find(t=>t.fromId===a.id&&t.toId===b.id)?.duration??0:0;return b?[{from:a.id,to:b.id,distance:Math.abs(x-(b.start-duration/2)*zoom),radius:Math.max(20,duration*zoom/2)}]:[];}).filter(t=>t.distance<=t.radius).sort((a,b)=>a.distance-b.distance)[0]??null;
}
