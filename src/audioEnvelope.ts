import type {Clip} from './editing';
/** All automation times are source seconds: trimming and splitting only change the visible window. */
export type VolumePoint={id:string;time:number;gain:number};
export type Fade={anchor:number;duration:number};
export type AudioEnvelope={points:VolumePoint[];fadeIn?:Fade;fadeOut?:Fade};
export const MAX_POINTS=64,POINT_GAP=.001;
export const clamp=(v:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
export const smooth=(x:number)=>{x=clamp(x);return x*x*(3-2*x);};
export function envelopeGain(c:Clip,t:number):number {
 const points=c.audio?.points??[];if(!points.length)return 1;
 if(t<=points[0].time)return points[0].gain;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(t<=b.time)return a.gain+(b.gain-a.gain)*(t-a.time)/(b.time-a.time);}
 return points.at(-1)!.gain;
}
export function fadeGain(c:Clip,t:number){const a=c.audio;return (a?.fadeIn?smooth((t-a.fadeIn.anchor)/a.fadeIn.duration):1)*(a?.fadeOut?smooth((a.fadeOut.anchor-t)/a.fadeOut.duration):1);}
export function crossfadeGain(c:Clip,t:number){const f=c.crossfade;return (f?.fadeIn?clamp((t-f.fadeIn.anchor)/f.fadeIn.duration):1)*(f?.fadeOut?clamp((f.fadeOut.anchor-t)/f.fadeOut.duration):1);}
export const audioGain=(c:Clip,t:number)=>(c.audioDetached?0:c.volume??1)*envelopeGain(c,t)*fadeGain(c,t)*crossfadeGain(c,t);
export function setFade(c:Clip,edge:'in'|'out',duration:number):Clip {
 duration=clamp(duration,0,c.sourceOut-c.sourceIn);
 const audio:AudioEnvelope={...c.audio,points:c.audio?.points??[]},key=edge==='in'?'fadeIn':'fadeOut';
 if(duration<.001)delete audio[key];else audio[key]={anchor:edge==='in'?c.sourceIn:c.sourceOut,duration};
 return {...c,audio};
}
export function addVolumePoint(c:Clip,time:number,id:string=crypto.randomUUID()):Clip {
 const points=c.audio?.points??[];time=clamp(time,c.sourceIn,c.sourceOut);
 if(points.length>=MAX_POINTS||points.some(p=>Math.abs(p.time-time)<POINT_GAP))return c;
 return {...c,audio:{...c.audio,points:[...points,{id,time,gain:envelopeGain(c,time)}].sort((a,b)=>a.time-b.time)}};
}
export function editVolumePoint(c:Clip,id:string,time:number,gain:number):Clip {
 const points=c.audio?.points??[],i=points.findIndex(p=>p.id===id);if(i<0)return c;
 const lo=Math.max(c.sourceIn,i?points[i-1].time+POINT_GAP:0),hi=Math.min(c.sourceOut,points[i+1]?points[i+1].time-POINT_GAP:c.sourceOut);
 if(lo>hi)return c;
 return {...c,audio:{...c.audio,points:points.map((p,n)=>n===i?{...p,time:clamp(time,lo,hi),gain:clamp(gain)}:p)}};
}
export function removeVolumePoint(c:Clip,id:string):Clip{return {...c,audio:{...c.audio,points:(c.audio?.points??[]).filter(p=>p.id!==id)}};}
export function visibleFade(c:Clip,edge:'in'|'out'):number {const f=edge==='in'?c.audio?.fadeIn:c.audio?.fadeOut;if(!f)return 0;return edge==='in'?clamp(f.anchor+f.duration-c.sourceIn,0,c.sourceOut-c.sourceIn):clamp(c.sourceOut-f.anchor+f.duration,0,c.sourceOut-c.sourceIn);}
/** Adaptive gain polyline: short fades remain visible even on hours of source audio. */
export function curveSamples(c:Clip,zoom:number):{time:number;gain:number}[]{
 const a=c.audio;
 const bounds=[c.sourceIn,c.sourceOut,...Object.entries(c.crossfade??{}).flatMap(([key,f])=>[f.anchor,f.anchor+(key==='fadeIn'?f.duration:-f.duration)]),...(a?.points??[]).map(p=>p.time),...(a?.fadeIn?[a.fadeIn.anchor,a.fadeIn.anchor+a.fadeIn.duration]:[]),...(a?.fadeOut?[a.fadeOut.anchor-a.fadeOut.duration,a.fadeOut.anchor]:[])].filter(t=>t>=c.sourceIn&&t<=c.sourceOut).sort((a,b)=>a-b).filter((t,i,all)=>!i||t-all[i-1]>1e-9);
 const out=[{time:c.sourceIn,gain:audioGain(c,c.sourceIn)}];
 const split=(lo:number,hi:number,depth=0)=>{const g0=audioGain(c,lo),g1=audioGain(c,hi);const bad=[.25,.5,.75].some(r=>Math.abs(audioGain(c,lo+(hi-lo)*r)-(g0+(g1-g0)*r))>.002);
  if(bad&&(hi-lo)*zoom>.25&&depth<24){const mid=(lo+hi)/2;split(lo,mid,depth+1);split(mid,hi,depth+1);}else out.push({time:hi,gain:g1});
 };
 for(let i=1;i<bounds.length;i++)split(bounds[i-1],bounds[i]);
 return out;
}
