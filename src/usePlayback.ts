import {useEffect,useRef,useState,type RefObject} from 'react';
import type {Project} from './model';
import {editDuration} from './editing';
import {PlaybackController,playbackKey,playbackRuns} from './playback';
export function usePlayback(elements:RefObject<Map<string,HTMLMediaElement>>,project:Project,source:string){
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[error,setError]=useState('');
 const cursor=useRef(0),latest=useRef(project);latest.current=project;
 const engine=useRef<PlaybackController|null>(null);
 if(!engine.current)engine.current=new PlaybackController(project,elements.current,message=>{setError(message);setPlaying(false);engine.current?.pause();});
 engine.current.update(project);
 const key=playbackKey(project);
 const pause=()=>{setPlaying(false);engine.current!.pause();};
 const seek=(t:number)=>{engine.current!.pause();cursor.current=Math.max(0,Math.min(editDuration(latest.current),t));setTime(cursor.current);engine.current!.sync(Math.min(cursor.current,Math.max(0,editDuration(latest.current)-1e-7)),false,true);};
 useEffect(()=>{seek(cursor.current);},[source,key]);
 useEffect(()=>{if(!playing)engine.current!.sync(Math.min(cursor.current,Math.max(0,editDuration(latest.current)-1e-7)),false);},[project.clips]);
 useEffect(()=>{
  if(!playing)return;let frame=0,last=performance.now(),alive=true;
  const tick=(now:number)=>{if(!alive)return;const d=editDuration(latest.current),waiting=engine.current!.sync(cursor.current,true),elapsed=Math.min(.1,(now-last)/1000);last=now;if(!waiting)cursor.current=Math.min(d,cursor.current+elapsed);setTime(cursor.current);if(cursor.current>=d){pause();return;}frame=requestAnimationFrame(tick);};
  frame=requestAnimationFrame(tick);return()=>{alive=false;cancelAnimationFrame(frame);};
 },[playing]);
 useEffect(()=>{const hide=()=>{if(document.hidden)pause();};document.addEventListener('visibilitychange',hide);return()=>{document.removeEventListener('visibilitychange',hide);engine.current!.pause();};},[]);
 return {time,playing,error,runs:playbackRuns(project),prepare:(id:string)=>engine.current!.prepare(id,cursor.current),previewVolume:(id:string,value:number)=>engine.current!.setVolume(id,value),seek,pause,reset:()=>{pause();seek(0);},toggle:()=>{if(playing)pause();else if(source&&editDuration(latest.current)>0){if(cursor.current>=editDuration(latest.current))seek(0);setError('');setPlaying(true);}}};
}
