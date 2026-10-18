/** Stable zero-based identities, independent video/audio namespaces; never renumber on removal. */
export const MAX_TRACKS=16;
export type TrackKind='video'|'audio';
export type TrackId=`V${number}`|`A${number}`|'T';
export type TrackDescriptor={id:string;kind:TrackKind;index:number};
export const trackId=(kind:TrackKind,index:number):TrackId=>`${kind==='video'?'V':'A'}${index+1}`;
export const defaultTrackLayout=():TrackDescriptor[]=>['video','audio'].flatMap(kind=>[0,1].map(index=>({id:trackId(kind as TrackKind,index),kind:kind as TrackKind,index})));
export const tracksOf=(p:{trackLayout:TrackDescriptor[]},kind:TrackKind)=>p.trackLayout.filter(t=>t.kind===kind).sort((a,b)=>a.index-b.index);
export const hasTrack=(p:{trackLayout:TrackDescriptor[]},kind:TrackKind,index:number)=>p.trackLayout.some(t=>t.kind===kind&&t.index===index);
export function routedAudio(c:{kind?:string;track?:number;audioRoute?:string}):number|null{
 if(c.kind==='audio')return c.track??0;
 if(c.audioRoute==='embedded')return null;
 if(c.audioRoute)return Number(c.audioRoute.slice(1))-1;
 return (c.track??0)<2?c.track??0:null;
}
