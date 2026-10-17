import {useEffect,useRef,useState} from 'react';
import Icon from './Icons';
const cache=new Map<string,string>();
let queue=Promise.resolve();
export default function MediaThumbnail({src,audio}:{src?:string;audio:boolean}){
 const host=useRef<HTMLDivElement>(null),[image,setImage]=useState(src?cache.get(src):undefined);
 useEffect(()=>{if(!src||audio)return;let alive=true,queued=false;const el=host.current;if(!el)return;const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting)||queued)return;queued=true;observer.disconnect();queue=queue.then(()=>new Promise<void>(resolve=>{
  if(!alive){resolve();return;}if(cache.has(src)){setImage(cache.get(src));resolve();return;}
  const v=document.createElement('video');v.crossOrigin='anonymous';v.muted=true;v.preload='auto';let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);v.onloadeddata=null;v.onseeked=null;v.onerror=null;v.removeAttribute('src');v.load();resolve();};const timer=setTimeout(finish,6000);
  const capture=()=>{try{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const scale=Math.max(160/v.videoWidth,90/v.videoHeight);canvas.getContext('2d')!.drawImage(v,(160-v.videoWidth*scale)/2,(90-v.videoHeight*scale)/2,v.videoWidth*scale,v.videoHeight*scale);const url=canvas.toDataURL('image/jpeg',.7);cache.set(src,url);if(alive)setImage(url);}catch{}finish();};
  v.onloadedmetadata=()=>{v.currentTime=Math.min(.2,v.duration/10);};v.onseeked=capture;v.onloadeddata=()=>{if(!v.seeking)capture();};v.onerror=finish;v.src=src;
 }));},{rootMargin:'200px'});observer.observe(el);return()=>{alive=false;observer.disconnect();};},[src,audio]);
 return <div className="media-thumbnail" ref={host}>{image?<img src={image} alt=""/>:<Icon name={audio?'audio':'video'} size={23}/>}</div>;
}
