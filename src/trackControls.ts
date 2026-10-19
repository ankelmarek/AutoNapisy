import type {Project} from './model';
import {compositionSegments,projectClips,type Clip} from './editing';
import {trackId,routedAudio,tracksOf,type TrackId} from './trackModel';
export type {TrackId} from './trackModel';
export const videoTrack=(c:Clip):TrackId=>trackId('video',c.track??0);
export const audioTrack=(c:Clip):TrackId|null=>{const index=routedAudio(c);return index===null?null:trackId('audio',index);};
export const videoHidden=(p:Project,c:Clip)=>c.kind!=='audio'&&!!p.tracks[videoTrack(c)]?.hidden;
export const clipMuted=(p:Project,c:Clip)=>!!c.audioDetached||!!(audioTrack(c)&&p.tracks[audioTrack(c)!]?.muted)||(c.kind!=='audio'&&!!p.tracks[videoTrack(c)]?.muted);
export function toggleTrack(p:Project,id:TrackId,control:'muted'|'hidden'):Project{
 return {...p,tracks:{...p.tracks,[id]:{...p.tracks[id],[control]:!p.tracks[id]?.[control]}}};
}

/** Embedded sound shares the routed bus's mute/lock controls, independently of its visual lane. */
export const clipTracks=(c:Clip):TrackId[]=>c.kind==='audio'?[audioTrack(c)!]:[videoTrack(c),...(!c.audioDetached&&audioTrack(c)?[audioTrack(c)!]:[])];
export const clipLocked=(p:Project,c:Clip)=>clipTracks(c).some(t=>p.tracks[t]?.locked);
/** Enforce edit locks at the common project boundary, including inspector and clipboard operations. */
export function assertUnlockedEdit(before:Project,next:Project){
 for(const kind of ['video','audio'] as const){const old=tracksOf(before,kind).map(t=>t.id),nextIds=tracksOf(next,kind).map(t=>t.id);for(const id of old.filter(id=>before.tracks[id]?.locked))for(const other of old.filter(x=>x!==id&&nextIds.includes(x))){if((old.indexOf(id)<old.indexOf(other))!==(nextIds.indexOf(id)<nextIds.indexOf(other)))throw Error('Kolejność zablokowanej ścieżki jest chroniona.');}}
 for(const c of projectClips(before)){if(clipLocked(before,c)&&JSON.stringify(c)!==JSON.stringify(projectClips(next).find(x=>x.id===c.id)))throw Error('Klip znajduje się na zablokowanej ścieżce.');}
 for(const c of projectClips(next)){const old=projectClips(before).find(x=>x.id===c.id);if(clipLocked(before,c)&&(!old||JSON.stringify(old)!==JSON.stringify(c)))throw Error('Nie można przenieść ani dodać klipu na zablokowaną ścieżkę.');}
 for(const t of before.transitions){if(projectClips(before).some(c=>(c.id===t.fromId||c.id===t.toId)&&clipLocked(before,c))&&JSON.stringify(t)!==JSON.stringify(next.transitions.find(n=>n.id===t.id)))throw Error('Przejście znajduje się na zablokowanej ścieżce.');}
 if(before.tracks.T?.locked&&(JSON.stringify(before.timelineSegments)!==JSON.stringify(next.timelineSegments)||JSON.stringify(before.captionEdits)!==JSON.stringify(next.captionEdits)||JSON.stringify(compositionSegments(before))!==JSON.stringify(compositionSegments(next))))throw Error('Ścieżka napisów jest zablokowana.');
}

export const soloIncludes=(c:Clip,solo:ReadonlySet<string>)=>solo.has(c.kind==='audio'?trackId('audio',c.track??0):videoTrack(c))||!!(audioTrack(c)&&solo.has(audioTrack(c)!));
export const auditionMuted=(p:Project,c:Clip,solo:ReadonlySet<string>)=>clipMuted(p,c)||(p.trackLayout.some(t=>solo.has(t.id))&&!soloIncludes(c,solo));
/** Solo is an audition overlay, never a project edit or an export setting. Bus solo includes routed video sound. */
export function auditionProject(p:Project,solo:ReadonlySet<string>):Project{
 const active=new Set([...solo].filter(id=>p.trackLayout.some(t=>t.id===id)));
 if(!active.size)return p;
 return {...p,clips:projectClips(p).map(c=>soloIncludes(c,active)?c:{...c,volume:0})};
}
