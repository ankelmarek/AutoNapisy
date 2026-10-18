import {useEffect,useRef,useState} from 'react';
import Icon from './Icons';
import {thumbnailFrame} from './thumbnailFrames';
export default function MediaThumbnail({path,duration,src,audio,cacheKey=''}:{path:string;duration:number|null;src?:string;audio:boolean;cacheKey?:string}){
 const host=useRef<HTMLDivElement>(null),[image,setImage]=useState<string>(),[scrub,setScrub]=useState<string>(),[hoverTime,setHoverTime]=useState<number|null>(null);
 const epoch=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),lastRequest=useRef(0);
 const identity=`${src}|${cacheKey}`;
 useEffect(()=>{setImage(undefined);setScrub(undefined);setHoverTime(null);if(!src||audio||!duration)return;let alive=true,queued=false;const el=host.current;if(!el)return;
  const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting)||queued)return;queued=true;observer.disconnect();void thumbnailFrame(path,Math.min(.2,duration/10),identity,()=>alive).then(url=>{if(alive&&url){setImage(url);}});},{rootMargin:'150px'});observer.observe(el);
  return()=>{alive=false;observer.disconnect();epoch.current++;clearTimeout(timer.current);};
 },[path,identity,audio,duration]);
 const leave=()=>{epoch.current++;clearTimeout(timer.current);setScrub(undefined);setHoverTime(null);};
 return <div className="media-thumbnail" ref={host} onPointerLeave={leave} onDragStart={leave} onPointerMove={e=>{if(e.pointerType!=='mouse'||audio||!src||!duration)return;const rect=e.currentTarget.getBoundingClientRect(),position=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));const time=Math.min(Math.max(0,duration-.05),Math.floor(position*duration*2)/2);setHoverTime(time);const token=++epoch.current;clearTimeout(timer.current);timer.current=setTimeout(()=>{lastRequest.current=performance.now();void thumbnailFrame(path,time,identity,()=>epoch.current===token,true).then(url=>{if(url&&epoch.current===token)setScrub(url);});},Math.max(65,160-(performance.now()-lastRequest.current)));}}>{scrub||image?<img draggable={false} src={scrub||image} alt=""/>:<Icon name={audio?'audio':'video'} size={23}/>} {hoverTime!==null&&<code className="thumbnail-time">{Math.floor(hoverTime/60)}:{(hoverTime%60).toFixed(1).padStart(4,'0')}</code>}</div>;
}
