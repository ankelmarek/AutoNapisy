import type {Project} from './model';
import type {Clip} from './editing';
export type TrackId=keyof Project['tracks'];
export const videoTrack=(c:Clip):'V1'|'V2'=>(c.track??0)===0?'V1':'V2';
export const audioTrack=(c:Clip):'A1'|'A2'=>(c.track??0)===0?'A1':'A2';
export const videoHidden=(p:Project,c:Clip)=>c.kind!=='audio'&&!!p.tracks[videoTrack(c)]?.hidden;
export const clipMuted=(p:Project,c:Clip)=>!!p.tracks[audioTrack(c)]?.muted||(c.kind!=='audio'&&!!p.tracks[videoTrack(c)]?.muted);
export function toggleTrack(p:Project,id:TrackId,control:'muted'|'hidden'):Project{
 return {...p,tracks:{...p.tracks,[id]:{...p.tracks[id],[control]:!p.tracks[id]?.[control]}}};
}
