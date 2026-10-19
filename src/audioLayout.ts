import type {Project} from './model';
import {clipEnd,type Clip} from './editing';
import {clipLocked} from './trackControls';
import {MAX_TRACKS,tracksOf,trackId,routedAudio} from './trackModel';
/** Interval partitioning is view-only: touching clips share a row; real overlaps never cover each other. */
export function audioRows(clips:Clip[],index:number):Record<string,number>{
 const ends:number[]=[],rows:Record<string,number>=Object.create(null);
 for(const c of clips.filter(c=>c.kind==='audio'&&(c.track??0)===index).sort((a,b)=>a.start-b.start||clipEnd(a)-clipEnd(b)||(a.id<b.id?-1:a.id>b.id?1:0))){
  let row=ends.findIndex(end=>end<=c.start+1e-6);if(row<0)row=ends.length;ends[row]=clipEnd(c);rows[c.id]=row;
 }
 return rows;
}
export const overlappingAudio=(clips:Clip[],c:Clip)=>c.kind==='audio'?clips.filter(x=>x.id!==c.id&&x.kind==='audio'&&(x.track??0)===(c.track??0)&&x.start<clipEnd(c)-1e-6&&clipEnd(x)>c.start+1e-6):[];
export function freeAudioTrack(p:Project,clips:Clip[],c:Clip):{index:number;create:boolean}|null{
 if(c.kind!=='audio'||clipLocked(p,c))return null;
 const free=tracksOf(p,'audio').find(t=>t.index!==(c.track??0)&&!p.tracks[t.id]?.locked&&!clips.some(x=>x.kind==='audio'&&(x.track??0)===t.index&&x.start<clipEnd(c)-1e-6&&clipEnd(x)>c.start+1e-6));
 if(free)return {index:free.index,create:false};
 const used=tracksOf(p,'audio').map(t=>t.index),index=Array.from({length:MAX_TRACKS},(_,i)=>i).find(i=>!used.includes(i));return index===undefined?null:{index,create:true};
}
export function audioRouteText(c:Clip){const route=routedAudio(c);return c.audioDetached?'Audio odłączone':route===null?'Audio połączone z obrazem, bez busa A':`Audio → ${trackId('audio',route)}. Wyciszenie tego busa obejmuje także dźwięk filmu.`;}
export function busVideoTracks(clips:Clip[],index:number){return [...new Set(clips.filter(c=>c.kind!=='audio'&&!c.audioDetached&&routedAudio(c)===index).map(c=>trackId('video',c.track??0)))].sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));}
export function audioBusText(clips:Clip[],index:number){const videos=busVideoTracks(clips,index);return `${trackId('audio',index)}: ${videos.length?`muzyka + audio filmów (${videos.join(', ')})`:'niezależne audio'}`;}
