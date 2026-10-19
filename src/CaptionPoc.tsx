import {useEffect,useRef,useState} from 'react';
import {invoke,convertFileSrc} from '@tauri-apps/api/core';
import {editDuration} from './editing';
import {parseProject} from './model';
import {activeCaption} from './captions';
import {createAnimatedCaptionRenderer} from './animatedCaptionCanvas';
import {pocProject,streamCaptionPoc} from './captionPocTransport';
/** Separate technical harness, only reachable with ?caption-poc. Backend requires ui-tests build. */
export default function CaptionPoc(){
 const [json,setJson]=useState(''),[preset,setPreset]=useState<'karaoke-flow'|'pop-beat'>('karaoke-flow'),[result,setResult]=useState<Awaited<ReturnType<typeof streamCaptionPoc>>|null>(null),[time,setTime]=useState(0),[progress,setProgress]=useState<number|null>(null),[error,setError]=useState(''),[fallback,setFallback]=useState(false);
 const controller=useRef<AbortController|null>(null),canvas=useRef<HTMLCanvasElement>(null),video=useRef<HTMLVideoElement>(null),session=useRef<number|null>(null);
 const renderer=useRef<{canvas:HTMLCanvasElement;draw:ReturnType<typeof createAnimatedCaptionRenderer>}|null>(null);
 const cleanup=async()=>{controller.current?.abort();if(video.current){video.current.pause();video.current.removeAttribute('src');video.current.load();}setResult(null);if(session.current!==null){const id=session.current;session.current=null;await invoke('caption_poc_cancel',{id});}};
 useEffect(()=>()=>{void cleanup();},[]);
 useEffect(()=>{if(!result)return;let frame=0;const tick=()=>{const v=video.current;if(v&&!v.paused&&!v.seeking)setTime(v.currentTime);frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[result]);
 useEffect(()=>{if(canvas.current&&result){if(renderer.current?.canvas!==canvas.current)renderer.current={canvas:canvas.current,draw:createAnimatedCaptionRenderer(canvas.current)};const t=result.start+time,c=activeCaption(result.snapshot.segments,t);const s=renderer.current.draw(c,c?result.snapshot.styles[c.styleId]:null,t);setFallback(s.fallback);canvas.current.dataset.frame=String(Math.floor(time*30+1e-7));}},[result,time]);
 const run=async()=>{setError('');await cleanup();setResult(null);const c=new AbortController();controller.current=c;setProgress(0);try{const r=await streamCaptionPoc(pocProject(parseProject(json),preset),0,Math.min(4,editDuration(parseProject(json))),c.signal,setProgress);session.current=r.id;setTime(0);setResult(r);}catch(e){setError(String(e));}finally{setProgress(null);controller.current=null;}};
 return <main style={{padding:20,height:'100vh',overflow:'auto'}} aria-label="Test techniczny animowanych napisów">
  <h1>0.33a · Animated Captions · test techniczny</h1><p>Strumień RGBA → FFV1 z alfą → rzeczywisty MP4 30 FPS. To fundament przed galerią i odbiorem wersji 0.33.</p>
  <textarea aria-label="Projekt testowy napisów" value={json} onChange={e=>setJson(e.target.value)} style={{width:'100%',height:65}}/>
  <label>Preset<select aria-label="Preset testu animacji" value={preset} onChange={e=>setPreset(e.target.value as typeof preset)}><option value="karaoke-flow">Karaoke Flow</option><option value="pop-beat">Pop Beat</option></select></label>
  <button disabled={progress!==null} onClick={()=>void run()}>Renderuj testowy MP4</button><button onClick={()=>void cleanup()}>Anuluj test</button>{progress!==null&&<p role="status">Przesyłanie strumienia: {progress}%</p>}
  {error&&<p role="alert">{error}</p>}
  {result&&<><p data-poc-output={result.path}>MP4: {result.path}</p><div style={{display:'flex',gap:24,height:340}}><video ref={video} controls crossOrigin="anonymous" src={convertFileSrc(result.path)} aria-label="Animowane napisy w MP4" style={{height:'100%'}} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)}/><canvas ref={canvas} width={320} height={568} aria-label="Referencyjna klatka napisów" style={{height:'100%',background:'#151a24'}}/></div><label>Klatka<input aria-label="Klatka testu animacji" type="number" min={0} max={result.frames-1} value={Math.floor(time*30+1e-7)} onChange={e=>{const t=Number(e.target.value)/30;setTime(t);if(video.current)video.current.currentTime=t;}}/></label>{fallback&&<p>Brak synchronizacji słów — użyto animacji planszy.</p>}</>}
 </main>;
}
