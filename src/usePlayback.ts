import {useEffect,useRef,useState,type RefObject} from 'react';
import type {Project} from './model';
import {clipEnd,editDuration,projectClips} from './editing';
/** One composition clock drives every picture and sound. Video audio remains linked. */
export function usePlayback(elements:RefObject<Map<string,HTMLMediaElement>>,project:Project,source:string){
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[error,setError]=useState('');
 const cursor=useRef(0),latest=useRef(project),pending=useRef(new Set<string>());latest.current=project;
 const pause=()=>{setPlaying(false);elements.current.forEach(v=>v.pause());};
 const sync=(t:number,play:boolean)=>{
  let waiting=false;
  for(const c of projectClips(latest.current)){
   const v=elements.current.get(c.id);if(!v)continue;
   const active=t>=c.start&&t<clipEnd(c);v.volume=c.volume??1;
   if(!active){v.pause();continue;}
   const expected=c.sourceIn+Math.min(t-c.start,c.sourceOut-c.sourceIn-.001);
   if(Number.isFinite(v.duration)&&!v.seeking&&(v.ended||Math.abs(v.currentTime-expected)>(play?.12:.005)))v.currentTime=Math.max(0,Math.min(expected,v.duration-.001));
   if(v.seeking||v.readyState<2||pending.current.has(c.id))waiting=true;
   if(play&&v.paused&&!pending.current.has(c.id)){
    pending.current.add(c.id);void v.play().catch(e=>{if(e instanceof DOMException&&e.name==='AbortError')return;setError(`Nie można odtworzyć „${c.id}”: ${String(e)}`);pause();}).finally(()=>pending.current.delete(c.id));
   }else if(!play)v.pause();
  }
  return waiting;
 };
 const seek=(t:number)=>{cursor.current=Math.max(0,Math.min(editDuration(latest.current),t));setTime(cursor.current);sync(Math.min(cursor.current,Math.max(0,editDuration(latest.current)-1e-7)),false);};
 useEffect(()=>{seek(cursor.current);},[source,project.clips]);
 useEffect(()=>{
  if(!playing)return;let frame=0,last=performance.now(),alive=true;
  const tick=(now:number)=>{if(!alive)return;const d=editDuration(latest.current);const waiting=sync(cursor.current,true);const elapsed=Math.min(.1,(now-last)/1000);last=now;if(!waiting)cursor.current=Math.min(d,cursor.current+elapsed);setTime(cursor.current);if(cursor.current>=d){pause();return;}frame=requestAnimationFrame(tick);};
  frame=requestAnimationFrame(tick);return()=>{alive=false;cancelAnimationFrame(frame);};
 },[playing]);
 useEffect(()=>{const hide=()=>{if(document.hidden)pause();};document.addEventListener('visibilitychange',hide);return()=>{document.removeEventListener('visibilitychange',hide);elements.current.forEach(v=>v.pause());};},[]);
 return {time,playing,error,seek,pause,reset:()=>{pause();seek(0);},toggle:()=>{if(playing)pause();else if(source&&editDuration(latest.current)>0){if(cursor.current>=editDuration(latest.current))seek(0);setError('');setPlaying(true);}}};
}
