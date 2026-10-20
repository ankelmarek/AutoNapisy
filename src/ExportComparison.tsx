import {uploadCaptionLayer,type CaptionUpload} from './captionLayer';
import {useEffect,useRef,useState} from 'react';
import {convertFileSrc,invoke} from '@tauri-apps/api/core';
import {serializeProject,type Project} from './model';
import {compositionProject,editDuration} from './editing';
import {captionExport} from './captions';
import {createFrameRenderer,ensureCaptionFonts} from './captionCanvas';
import {exportOptionsSchema,type ExportOptions,type ExportMeasurement,type ExportComparisonReport} from './exportProfiles';
import Icon from './Icons';
export default function ExportComparison({project,options,time,onClose,onChoose,onMeasured}:{project:Project;options:ExportOptions;time:number;onClose:()=>void;onChoose:(m:ExportMeasurement)=>void;onMeasured:(m:ExportMeasurement)=>void}){
 const total=Math.floor(editDuration(project)*30+1e-6)/30,initial=Math.min(4,total),dialog=useRef<HTMLDialogElement>(null),video=useRef<HTMLVideoElement>(null),session=useRef<string|null>(null),controller=useRef<AbortController|null>(null),alive=useRef(true),resume=useRef({time:0,play:false});
 const [start,setStart]=useState(Math.max(0,Math.round(Math.min(time,total-initial)*30)/30)),[duration,setDuration]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[progress,setProgress]=useState<number|null>(null),[error,setError]=useState(''),[report,setReport]=useState<ExportComparisonReport|null>(null),[selected,setSelected]=useState(0),[loop,setLoop]=useState(true);
 const release=()=>{const v=video.current;if(v){v.pause();v.removeAttribute('src');v.load();}};
 const cancel=()=>{controller.current?.abort();release();if(session.current){void invoke('studio_sample_cancel',{key:session.current}).catch(()=>{});session.current=null;}};
 useEffect(()=>{alive.current=true;dialog.current?.showModal();return()=>{alive.current=false;cancel();dialog.current?.close();};},[]);
 useEffect(()=>{if(!busy)return;let current=true;const t=setInterval(()=>{const key=session.current;if(key)void invoke<{message:string;progress:number|null}>('studio_sample_status',{key}).then(s=>{if(current){setMessage(s.message);setProgress(s.progress);}}).catch(()=>{});},700);return()=>{current=false;clearInterval(t);};},[busy]);
 const generate=async()=>{
  if(controller.current)return;cancel();const abort=new AbortController();controller.current=abort;const key=crypto.randomUUID();session.current=key;setReport(null);setError('');setBusy(true);setProgress(null);setMessage('Sprawdzanie źródeł i zakresu…');
  const check=()=>{if(abort.signal.aborted)throw new DOMException('Anulowano','AbortError');};
  try{
   const captions=captionExport(compositionProject(project));
   const prepared=await invoke<{width:number;height:number;frames:number[];totalFrames:number;animation?:CaptionUpload|null}>('studio_sample_begin',{key,json:serializeProject(project),captions:JSON.stringify(captions.segments),options,start,duration});check();
   if(prepared.totalFrames!==captions.segments.length)throw Error('Niezgodne napisy próbki');
   if(prepared.animation){await uploadCaptionLayer(captions,prepared.width,prepared.height,prepared.animation,abort.signal,n=>{setMessage('Przygotowywanie animowanych napisów…');setProgress(n);});}
   else if(prepared.frames.length){await ensureCaptionFonts(project);check();const render=createFrameRenderer(prepared.width,prepared.height);for(const index of prepared.frames){check();const s=captions.segments[index];if(!s)throw Error('Nieprawidłowa plansza próbki');const png=await render(s.text,captions.styles[s.styleId]);check();await invoke('studio_sample_upload',{key,index,png});await new Promise(r=>setTimeout(r,0));}}
   const result=await invoke<ExportComparisonReport>('studio_sample_run',{key});check();
   if(!alive.current)return;
   const base=result.comparison.measurements.findIndex(m=>m.options.crf===options.crf&&(m.options.targetMb??null)===(options.targetMb??null));
   setReport(result);setSelected(Math.max(0,base));resume.current={time:0,play:false};if(base>=0)onMeasured(result.comparison.measurements[base]);setMessage('Próbki gotowe');
  }catch(e){if(alive.current)setError(abort.signal.aborted?'Anulowano porównanie.':String(e));void invoke('studio_sample_cancel',{key}).catch(()=>{});}
  finally{if(controller.current===abort)controller.current=null;if(alive.current)setBusy(false);}
 };
 const close=()=>{cancel();onClose();};
 const resetRange=(a:number,b:number)=>{cancel();setReport(null);setStart(a);setDuration(b);setError('');};
 const chosen=report?.comparison.measurements[selected];
 return <dialog ref={dialog} className="studio-dialog studio-comparison" aria-label="Porównanie jakości eksportu" onCancel={e=>{e.preventDefault();e.stopPropagation();close();}} onKeyDown={e=>e.stopPropagation()}>
  <div className="panelhead"><h2><Icon name="eye"/> Porównanie jakości A/B</h2><button aria-label="Zamknij porównanie jakości" className="icon-button" onClick={close}><Icon name="x"/></button></div>
  <div className="compare-content">
   <section className="compare-controls"><p>Wybierz reprezentatywny fragment z ruchem, szczegółami i napisami. Powstaną rzeczywiste pliki w wybranej rozdzielczości.</p>
    <label>Początek próbki (s)<input aria-label="Początek próbki eksportu" type="number" min={0} max={Math.max(0,total-duration)} step={1/30} value={Number(start.toFixed(3))} disabled={busy} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))resetRange(Math.round(Math.max(0,Math.min(n,total-duration))*30)/30,duration);}}/></label>
    <label>Długość próbki<select aria-label="Długość próbki eksportu" disabled={busy||total<3} value={duration} onChange={e=>{const n=Number(e.target.value);resetRange(Math.min(start,Math.floor((total-n)*30)/30),n);}}>{[...new Set([3,4,5,initial].filter(n=>n<=total))].sort((a,b)=>a-b).map(n=><option value={n} key={n}>{n.toFixed(2)} s</option>)}</select></label>
    <button className="primary" disabled={busy||total<2/30} onClick={()=>void generate()}><Icon name="play" size={16}/> Przygotuj próbki A/B</button>
    {busy&&<div role="status"><p>{message}</p><progress aria-label="Postęp porównania jakości" max={100} value={progress??undefined}/><button onClick={cancel}><Icon name="stop" size={14}/> Anuluj przygotowanie próbek</button></div>}
    {error&&<p className="error" role="alert">{error}</p>}
    {report&&<div className="compare-variants" role="group" aria-label="Warianty jakości">{report.comparison.measurements.map((m,i)=><button key={m.index} aria-pressed={selected===i} onClick={()=>{if(selected===i)return;const v=video.current;resume.current={time:v?.currentTime??0,play:v?!v.paused:false};v?.pause();setSelected(i);}}><b>{String.fromCharCode(65+i)} · {m.label}</b><span>{(m.bytes/1e6).toFixed(2)} MB · kodowanie {m.encodeSeconds.toFixed(1)} s</span></button>)}</div>}
   </section>
   <section className="compare-review"><div className="compare-video">{report&&chosen?<video ref={video} src={convertFileSrc(report.paths[chosen.index])} controls crossOrigin="anonymous" playsInline preload="auto" loop={loop} aria-label="Zakodowana próbka jakości" onLoadedMetadata={()=>{const v=video.current;if(v){v.currentTime=Math.min(resume.current.time,Math.max(0,v.duration-.04));if(resume.current.play)void v.play().catch(()=>{});}}}/>:<p>{busy?'Kodowanie rzeczywistych wariantów…':'Przygotuj próbki, aby porównać jakość.'}</p>}</div>
    {report&&chosen&&<><label className="compare-loop"><input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/> Odtwarzaj w pętli</label><p>Zakres montażu: {report.comparison.range.start.toFixed(3)}–{(report.comparison.range.start+report.comparison.range.duration).toFixed(3)} s. Przełączenie A/B zachowuje pozycję odtwarzania.</p><dl className="compare-measurements"><dt>Rozmiar rzeczywistej próbki</dt><dd>{(chosen.bytes/1e6).toFixed(2)} MB</dd><dt>Składanie próbki</dt><dd>{report.comparison.compositionSeconds.toFixed(1)} s</dd><dt>Szacowany cały film</dt><dd>{chosen.estimatedMb[0].toFixed(1)}–{chosen.estimatedMb[1].toFixed(1)} MB</dd><dt>Szacowany czas eksportu</dt><dd>{Math.round(chosen.estimatedSeconds[0])}–{Math.ceil(chosen.estimatedSeconds[1])} s</dd></dl></>}
    <p className="hint">Szacunki wynikają z jednej próbki; inne sceny i obciążenie komputera mogą znacznie zmienić wynik. Limit MB dotyczy pliku MP4. Tryb SRT porównuje obraz bez wypalonych napisów.</p>
   </section>
  </div><div className="studio-actions"><button onClick={close}>Wróć do Export Studio</button><button className="primary" disabled={!chosen||busy} onClick={()=>{if(chosen){onChoose({...chosen,options:exportOptionsSchema.parse(chosen.options)});close();}}}><Icon name="check" size={16}/> Użyj ustawień wybranego wariantu</button></div>
 </dialog>;
}
