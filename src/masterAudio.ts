import type {Project} from './model';
import {projectClips,clipMedia,editDuration} from './editing';
import {clipMuted} from './trackControls';
/** Session-independent signature of the audible edit, excluding the master itself. */
export function audioBasis(p:Project):string{
 const value=JSON.stringify([editDuration(p),projectClips(p).map(c=>[c.id,clipMedia(p,c)?.path,c.start,c.sourceIn,c.sourceOut,c.volume??1,c.audio??null,c.crossfade??null,clipMuted(p,c)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),p.transitions.map(t=>[t.fromId,t.toId,t.duration]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);
 let hash=0xcbf29ce484222325n;for(const byte of new TextEncoder().encode(value))hash=BigInt.asUintN(64,(hash^BigInt(byte))*0x100000001b3n);return hash.toString(16).padStart(16,'0');
}
export function normalizationStale(p:Project){const n=p.masterAudio.normalization;return !!n&&(!!n.stale||n.basis!==audioBasis(p));}
export function normalizedProject(p:Project,gainDb:number,targetLufs:number):Project{
 if(!Number.isFinite(gainDb)||gainDb< -60||gainDb>24||!Number.isFinite(targetLufs)||targetLufs< -30||targetLufs> -9)throw Error('Nieprawidłowa normalizacja');
 return {...p,masterAudio:{gainDb,normalization:{targetLufs,basis:audioBasis(p)}}};
}
