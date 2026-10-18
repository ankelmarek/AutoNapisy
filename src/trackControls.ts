import type {Project} from './model';
import {compositionSegments,projectClips,type Clip} from './editing';
export type TrackId=keyof Project['tracks'];
export const videoTrack=(c:Clip):'V1'|'V2'=>(c.track??0)===0?'V1':'V2';
export const audioTrack=(c:Clip):'A1'|'A2'=>(c.track??0)===0?'A1':'A2';
export const videoHidden=(p:Project,c:Clip)=>c.kind!=='audio'&&!!p.tracks[videoTrack(c)]?.hidden;
export const clipMuted=(p:Project,c:Clip)=>!!c.audioDetached||!!p.tracks[audioTrack(c)]?.muted||(c.kind!=='audio'&&!!p.tracks[videoTrack(c)]?.muted);
export function toggleTrack(p:Project,id:TrackId,control:'muted'|'hidden'):Project{
 return {...p,tracks:{...p.tracks,[id]:{...p.tracks[id],[control]:!p.tracks[id]?.[control]}}};
}

/** Embedded sound occupies its routed A lane as well as the picture lane. */
export const clipTracks=(c:Clip):TrackId[]=>c.kind==='audio'?[audioTrack(c)]:[videoTrack(c),...(!c.audioDetached?[audioTrack(c)]:[])];
export const clipLocked=(p:Project,c:Clip)=>clipTracks(c).some(t=>p.tracks[t]?.locked);
/** Enforce edit locks at the common project boundary, including inspector and clipboard operations. */
export function assertUnlockedEdit(before:Project,next:Project){
 for(const c of projectClips(before)){if(clipLocked(before,c)&&JSON.stringify(c)!==JSON.stringify(projectClips(next).find(x=>x.id===c.id)))throw Error('Klip znajduje się na zablokowanej ścieżce.');}
 for(const c of projectClips(next)){const old=projectClips(before).find(x=>x.id===c.id);if(clipLocked(before,c)&&(!old||JSON.stringify(old)!==JSON.stringify(c)))throw Error('Nie można przenieść ani dodać klipu na zablokowaną ścieżkę.');}
 for(const t of before.transitions){if(projectClips(before).some(c=>(c.id===t.fromId||c.id===t.toId)&&clipLocked(before,c))&&JSON.stringify(t)!==JSON.stringify(next.transitions.find(n=>n.id===t.id)))throw Error('Przejście znajduje się na zablokowanej ścieżce.');}
 if(before.tracks.T?.locked&&(JSON.stringify(before.timelineSegments)!==JSON.stringify(next.timelineSegments)||JSON.stringify(before.captionEdits)!==JSON.stringify(next.captionEdits)||JSON.stringify(compositionSegments(before))!==JSON.stringify(compositionSegments(next))))throw Error('Ścieżka napisów jest zablokowana.');
}
