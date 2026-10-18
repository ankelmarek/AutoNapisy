import {useEffect,useRef,useState} from 'react';
import type {TransitionKind} from './transitionCatalog';
export const demoUrl=(name:string)=>`${import.meta.env.BASE_URL}transition-demos/${name}`;
export function useReducedMotion(){
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const q=window.matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(q.matches);q.addEventListener('change',update);return()=>q.removeEventListener('change',update);},[]);
 return reduced;
}
export default function TransitionDemo({kind,duration,onError}:{kind:TransitionKind;duration:number;onError:()=>void}){
 const ref=useRef<HTMLVideoElement>(null);
 useEffect(()=>{if(ref.current)ref.current.playbackRate=1/duration;},[duration,kind]);
 useEffect(()=>{const video=ref.current;if(!video)return;const visibility=()=>{if(document.hidden)video.pause();else void video.play().catch(()=>{});};document.addEventListener('visibilitychange',visibility);return()=>{document.removeEventListener('visibilitychange',visibility);video.pause();video.removeAttribute('src');video.load();};},[]);
 return <video ref={ref} className="effect-demo-video" src={demoUrl(`${kind}.mp4`)} autoPlay loop muted playsInline preload="auto" aria-hidden="true" onError={onError} onLoadedData={()=>{if(ref.current)ref.current.playbackRate=1/duration;}}/>;
}
