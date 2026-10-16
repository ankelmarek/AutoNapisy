import {useEffect,useRef,useState,type RefObject} from 'react';
import type {Project} from './model';
import {clipAt,editDuration,projectClips} from './editing';
export function usePlayback(video:RefObject<HTMLVideoElement|null>,project:Project,source:string){
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[error,setError]=useState('');
 const cursor=useRef(0),pending=useRef(false),latest=useRef(project);latest.current=project;
 const pause=()=>{setPlaying(false);video.current?.pause();};
 const seek=(t:number)=>{
  const p=latest.current,d=editDuration(p);cursor.current=Math.max(0,Math.min(d,t));setTime(cursor.current);
  const c=clipAt(projectClips(p),Math.min(cursor.current,Math.max(0,d-1e-7)));
  if(video.current && c && Number.isFinite(video.current.duration))video.current.currentTime=c.sourceIn+Math.max(0,Math.min(cursor.current-c.start,c.sourceOut-c.sourceIn-.001));
  if(!c)video.current?.pause();
 };
 useEffect(()=>{seek(cursor.current);},[source,project.clips,project.media?.duration]);
 useEffect(()=>{
  if(!playing)return;
  let frame=0,last=performance.now(),alive=true;
  const tick=(now:number)=>{
   if(!alive)return;
   const p=latest.current,d=editDuration(p),v=video.current;
   let elapsed=Math.min(.1,(now-last)/1000);last=now;
   const previous=clipAt(projectClips(p),cursor.current);
   if(previous && v && (v.seeking||v.readyState<2||pending.current))elapsed=0;
   cursor.current=Math.min(d,cursor.current+elapsed);
   if(cursor.current>=d){setTime(d);setPlaying(false);v?.pause();return;}
   const c=clipAt(projectClips(p),cursor.current);
   if(v && c){
    const expected=c.sourceIn+cursor.current-c.start;
    if(Math.abs(v.currentTime-expected)>.15 && !v.seeking)v.currentTime=expected;
    if(v.paused&&!pending.current){pending.current=true;void v.play().catch(e=>{if(alive){setError(`Nie można odtworzyć filmu: ${String(e)}`);setPlaying(false);}}).finally(()=>{pending.current=false;});}
   }else v?.pause();
   setTime(cursor.current);frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return ()=>{alive=false;cancelAnimationFrame(frame);};
 },[playing,video]);
 useEffect(()=>()=>video.current?.pause(),[video]);
 return {time,playing,error,seek,pause,reset:()=>{pause();seek(0);},toggle:()=>{if(playing)pause();else if(source&&editDuration(latest.current)>0){if(cursor.current>=editDuration(latest.current))seek(0);setError('');setPlaying(true);}}};
}
