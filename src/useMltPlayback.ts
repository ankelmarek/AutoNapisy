import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import type {Project} from './model';
import {clipMedia,editDuration,projectClips} from './editing';
type Started={id:number;start:number;duration:number};
type Chunk={data:string;offset:number;done:boolean;error:string|null;aspect?:number|null};
const MIME='video/mp4; codecs="avc1.42E01F, mp4a.40.2"';
export function useMltPlayback(project:Project){
 const video=useRef<HTMLVideoElement>(null),latest=useRef(project);latest.current=project;
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0),[aspect,setAspect]=useState(16/9);
 const cursor=useRef(0),wanted=useRef(false),base=useRef(0),session=useRef(0);
 const duration=editDuration(project),key=JSON.stringify([project.media?.path,projectClips(project).map(c=>[c,clipMedia(project,c)?.path]),project.transitions,project.canvas,project.tracks.V1,project.tracks.V2,project.tracks.A1,project.tracks.A2]);
 const pause=()=>{wanted.current=false;setPlaying(false);video.current?.pause();};
 const seek=(t:number)=>{t=Math.max(0,Math.min(editDuration(latest.current),t));cursor.current=t;setTime(t);const v=video.current,local=t-base.current;let available=false;if(v&&local>=0)for(let i=0;i<v.buffered.length;i++)if(local>=v.buffered.start(i)&&local<v.buffered.end(i)-.02)available=true;if(v&&available){v.currentTime=local;}else{v?.pause();setRevision(n=>n+1);}};
 useEffect(()=>{if(!duration){pause();setTime(0);cursor.current=0;setLoading(false);video.current?.removeAttribute('src');return;}
  let alive=true,id=0,url='',timer:number|undefined,media:MediaSource|null=null;const v=video.current;if(!v)return;v.pause();setLoading(true);setError('');cursor.current=Math.min(cursor.current,Math.max(0,duration-1/30));
  const fail=(e:unknown)=>{if(alive){setError(String(e));setLoading(false);pause();}};
  const start=async()=>{try{if(!window.MediaSource||!MediaSource.isTypeSupported(MIME))throw Error('WebView2 nie obsługuje podglądu H.264/AAC. Zaktualizuj WebView2 Runtime.');
    const next=await invoke<Started>('start_mlt_preview',{json:JSON.stringify(latest.current),from:cursor.current});id=next.id;if(!alive){void invoke('cancel_mlt_preview',{id}).catch(()=>{});return;}session.current=id;base.current=next.start;cursor.current=next.start;setTime(next.start);
    media=new MediaSource();url=URL.createObjectURL(media);v.src=url;v.load();
    media.addEventListener('sourceopen',()=>{if(!alive||!media)return;void(async()=>{try{const buffer=media!.addSourceBuffer(MIME);let offset=0;
      while(alive){const chunk=await invoke<Chunk>('read_mlt_preview',{id,offset});if(!alive)return;if(chunk.error)throw Error(chunk.error);offset=chunk.offset;if(chunk.aspect)setAspect(chunk.aspect);
       if(chunk.data){const raw=atob(chunk.data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));await new Promise<void>((resolve,reject)=>{const done=()=>{buffer.removeEventListener('error',bad);resolve();},bad=()=>{buffer.removeEventListener('updateend',done);reject(Error('Błąd bufora podglądu MLT'));};buffer.addEventListener('updateend',done,{once:true});buffer.addEventListener('error',bad,{once:true});try{buffer.appendBuffer(bytes);}catch(e){buffer.removeEventListener('updateend',done);buffer.removeEventListener('error',bad);reject(e);}});}
       if(chunk.done){if(!offset)throw Error('MLT nie utworzył obrazu podglądu. Spróbuj ponownie lub sprawdź diagnostykę komponentów.');if(media!.readyState==='open'&&!buffer.updating)media!.endOfStream();break;}
       await new Promise(r=>setTimeout(r,chunk.data?10:90));
      }
    }catch(e){fail(e);}})();},{once:true});
   }catch(e){fail(e);}};
  timer=window.setTimeout(()=>void start(),180);
  const ready=()=>{if(!alive)return;setLoading(false);if(wanted.current)void v.play().catch(fail);};const ended=()=>{if(!alive)return;cursor.current=editDuration(latest.current);setTime(cursor.current);pause();};const waiting=()=>{if(alive&&wanted.current)setLoading(true);};
  const decodeError=()=>{if(v.error)fail(Error(`Nie można odtworzyć podglądu MLT (${v.error.code}): ${v.error.message||'błąd dekodowania w WebView2'}`));};
  v.addEventListener('canplay',ready);v.addEventListener('ended',ended);v.addEventListener('waiting',waiting);v.addEventListener('error',decodeError);
  return()=>{alive=false;clearTimeout(timer);v.pause();v.removeEventListener('canplay',ready);v.removeEventListener('ended',ended);v.removeEventListener('waiting',waiting);v.removeEventListener('error',decodeError);if(id)void invoke('cancel_mlt_preview',{id}).catch(()=>{});v.removeAttribute('src');v.load();if(url)URL.revokeObjectURL(url);};
 },[key,revision,duration]);
 useEffect(()=>{if(!playing)return;let frame=0;const tick=()=>{const v=video.current;if(v&&!v.seeking&&v.readyState>=2){cursor.current=Math.min(editDuration(latest.current),base.current+v.currentTime);setTime(cursor.current);}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[playing]);
 useEffect(()=>{const hide=()=>{if(document.hidden)pause();};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide);},[]);
 return {video,time,playing,loading,error,aspect,pause,seek,retry:()=>setRevision(n=>n+1),reset:()=>{pause();seek(0);},previewVolume:(_id:string,_gain:number)=>{},toggle:()=>{if(wanted.current)pause();else if(editDuration(latest.current)>0){if(cursor.current>=editDuration(latest.current))seek(0);wanted.current=true;setPlaying(true);const v=video.current;if(v&&v.readyState>=2)void v.play().catch(e=>{setError(String(e));pause();});}}};
}
