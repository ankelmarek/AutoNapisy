import type {Project} from './model';
import {projectClips,type Clip} from './editing';
import {clipLocked,clipMuted} from './trackControls';
/** Capture the existing transition mix in source time; subsequent audio edits are independent. */
export function detachAudio(p:Project,id:string,track:0|1=0,audioId:string=crypto.randomUUID()):Project {
 const clips=projectClips(p),c=clips.find(c=>c.id===id);
 if(!c||c.kind==='audio'||c.audioDetached)throw Error('Wybierz film z połączonym dźwiękiem.');
 if(clips.length>=100)throw Error('Projekt ma już 100 klipów.');
 if(clipLocked(p,c)||p.tracks[track===0?'A1':'A2']?.locked)throw Error('Odblokuj ścieżkę obrazu i docelową ścieżkę audio.');
 const incoming=p.transitions.find(t=>t.toId===id),outgoing=p.transitions.find(t=>t.fromId===id),group=c.syncGroup??crypto.randomUUID();
 const sound:Clip={id:audioId,kind:'audio',assetId:c.assetId,start:c.start-(incoming?.duration??0),sourceIn:c.sourceIn-(incoming?.duration??0),sourceOut:c.sourceOut,track,volume:clipMuted(p,c)?0:c.volume,audio:c.audio,syncGroup:group,
  ...(incoming||outgoing?{crossfade:{...(incoming?{fadeIn:{anchor:c.sourceIn-incoming.duration,duration:incoming.duration}}:{}),...(outgoing?{fadeOut:{anchor:c.sourceOut,duration:outgoing.duration}}:{})}}:{})};
 return {...p,clips:[...clips.map(x=>x.id===id?{...x,audioDetached:true,syncGroup:group}:x),sound]};
}
/** Offset is measured from source alignment; J/L trims preserve it, independent moves change it. */
export function syncOffset(p:Project,c:Clip):number|null {
 if(!c.syncGroup)return null;const peer=projectClips(p).find(x=>x.id!==c.id&&x.syncGroup===c.syncGroup&&((x.kind==='audio')!==(c.kind==='audio')));
 return peer?c.start-c.sourceIn-(peer.start-peer.sourceIn):null;
}
export function realignAudio(p:Project,id:string):Project {
 const clips=projectClips(p),c=clips.find(x=>x.id===id),offset=c&&syncOffset(p,c);
 if(!c||c.kind!=='audio'||offset==null)return p;
 if(clipLocked(p,c))throw Error('Ścieżka audio jest zablokowana.');
 const start=c.start-offset;if(start<0||start+c.sourceOut-c.sourceIn>86400)throw Error('Zsynchronizowany dźwięk wychodzi poza oś czasu.');
 return {...p,clips:clips.map(x=>x.id===id?{...x,start}:x)};
}
export const detachedLabel=(c:Clip)=>c.kind==='audio'?'Niezależne audio':c.audioDetached?'Obraz · audio odłączone':'Obraz + połączony dźwięk';
