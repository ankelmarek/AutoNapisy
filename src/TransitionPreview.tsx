import {useEffect,useRef,useState} from 'react';
import {invoke,convertFileSrc} from '@tauri-apps/api/core';
import type {Project} from './model';
export function useTransitionPreviews(project:Project){
 const [result,setResult]=useState<{key:string;urls:Record<string,string>;error:string}>({key:'',urls:{},error:''});
 const key=JSON.stringify([project.media,project.assets.map(({segments:_,...a})=>a),project.clips?.map(({volume:_,...c})=>c),project.transitions]);
 useEffect(()=>{let alive=true;const urls:Record<string,string>={};setResult({key,urls:{},error:''});void(async()=>{for(const t of project.transitions){if(!alive)return;try{const path=await invoke<string>('prepare_transition_preview',{json:JSON.stringify(project),id:t.id});urls[t.id]=convertFileSrc(path);if(alive)setResult({key,urls:{...urls},error:''});}catch(e){if(alive)setResult({key,urls:{...urls},error:`Nie można przygotować przejścia: ${String(e)}`});return;}}})();return()=>{alive=false;};},[key]);
 return {urls:result.key===key?result.urls:{},pending:project.transitions.length>Object.keys(result.key===key?result.urls:{}).length,error:result.key===key?result.error:''};
}
export default function TransitionPreview({src,start,duration,time,playing,active}:{src:string;start:number;duration:number;time:number;playing:boolean;active:boolean}){
 const ref=useRef<HTMLVideoElement>(null),latest=useRef({time,playing,active});latest.current={time,playing,active};
 const sync=()=>{const v=ref.current;if(!v)return;const {time,playing,active}=latest.current,target=Math.max(0,Math.min(duration-.001,time-start));if(!v.seeking&&Number.isFinite(v.duration)&&Math.abs(v.currentTime-target)>(playing?.12:.005))v.currentTime=target;if(active&&playing){if(v.paused)void v.play().catch(()=>{});}else v.pause();};
 useEffect(sync,[time,playing,active,src]);useEffect(()=>()=>{ref.current?.pause();},[]);
 return <video ref={ref} className="transition-preview" src={src} muted playsInline preload="auto" hidden={!active} onLoadedData={sync}/>;
}
