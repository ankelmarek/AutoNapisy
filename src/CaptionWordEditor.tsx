import {useEffect,useRef,useState} from 'react';
import type {Project} from './model';
import type {EditedSegment} from './editing';
import {captionWordDraft,applyCaptionWords} from './captionEditing';
import {captionTokens,captionPlayheadTime,type WordDraft} from './captionTiming';
import {reanalyzeCaption,validateCaptionSource} from './captionReanalysis';
export default function CaptionWordEditor({project,caption,locked,getProject,onChange,onSeek,time}:{project:Project;caption:EditedSegment;locked:boolean;getProject:()=>Project;onChange:(p:Project)=>void;onSeek:(t:number)=>void;time:number}){
 const [draft,setDraft]=useState<{base:Project;rows:WordDraft[];mode:'manual'|'reanalyzed';stamp?:string}|null>(null),[error,setError]=useState(''),[status,setStatus]=useState(''),[running,setRunning]=useState(false);
 const abort=useRef<AbortController|null>(null),mounted=useRef(true),generation=useRef(0);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;abort.current?.abort();};},[]);
 useEffect(()=>{generation.current++;abort.current?.abort();setDraft(null);setStatus('');setRunning(false);setError('');},[project]);
 const count=captionTokens(caption.text).length,duration=caption.end-caption.start,allowed=count>0&&count<=256;
 const open=()=>{setError('');setDraft({base:project,rows:captionWordDraft(project,caption),mode:'manual'});};
 const analyze=async()=>{
  if(locked||!allowed||running)return;const base=getProject();if(base!==project)return;
  const controller=new AbortController();abort.current=controller;const gen=++generation.current;setRunning(true);setError('');setStatus('Przygotowanie fragmentu audio…');setDraft(null);
  try{const {rows,stamp}=await reanalyzeCaption(base,caption,controller.signal,s=>{if(mounted.current&&gen===generation.current)setStatus(s.progress==null?s.message:`${s.message} ${s.progress}%`);});
   if(!mounted.current||gen!==generation.current)return;if(getProject()!==base)throw Error('Projekt zmienił się. Wynik odrzucony.');setDraft({base,rows,mode:'reanalyzed',stamp});setStatus('Propozycja Whisper. Zgodność tekstu nie gwarantuje dokładności czasów — sprawdź odsłuchem.');
  }catch(e){if(mounted.current&&gen===generation.current){setStatus('');setError(e instanceof DOMException&&e.name==='AbortError'?'Anulowano. Projekt bez zmian.':String(e));}}
  finally{if(mounted.current&&gen===generation.current)setRunning(false);}
 };
 const update=(i:number,edge:'start'|'end',value:number)=>setDraft(d=>d?{...d,mode:'manual',rows:d.rows.map((w,n)=>n===i?{...w,[edge]:Number.isFinite(value)?value:undefined,origin:'manual'}:w)}:d);
 const accept=async()=>{if(!draft||locked||running)return;const gen=generation.current;setRunning(true);try{if(getProject()!==draft.base)throw Error('Projekt zmienił się. Otwórz czasowanie ponownie.');if(draft.mode==='reanalyzed'&&draft.stamp)await validateCaptionSource(draft.base,caption,draft.stamp);if(!mounted.current||gen!==generation.current)return;if(getProject()!==draft.base)throw Error('Projekt zmienił się. Otwórz czasowanie ponownie.');const next=applyCaptionWords(draft.base,caption,draft.rows,draft.mode);onChange(next);setDraft(null);setStatus('');setError('');}catch(e){if(mounted.current&&gen===generation.current)setError(String(e));}finally{if(mounted.current&&gen===generation.current)setRunning(false);}};
 return <section className="caption-word-editor" aria-label="Czasowanie słów">
  <div className="caption-timing-actions"><button disabled={locked||!allowed||running} onClick={open}>Ustaw czasy ręcznie</button><button disabled={locked||!allowed||duration>30||running} title="Ponownie rozpoznaj wyłącznie fragment tego napisu (do 30 s). To nie forced alignment." onClick={()=>void analyze()}>Dopasuj do nagrania</button>{running&&!draft&&<button onClick={()=>abort.current?.abort()}>Anuluj dopasowanie</button>}</div>
  {!allowed&&<small>Czasowanie słów obsługuje od 1 do 256 słów w jednym napisie.</small>}
  {duration>30&&<small>Automatyczna analiza obejmuje napis do 30 sekund. Dłuższy można dopasować ręcznie.</small>}
  {status&&<p role="status">{status}</p>}{error&&<p role="alert" className="error">{error}</p>}
  {draft&&<><p>{draft.mode==='manual'?'Ręczne czasy':'Propozycja czasów'} · sekundy od początku napisu ({duration.toFixed(3)} s).</p><small>Zachowane punkty: {draft.rows.filter(w=>w.origin==='inherited').length}/{count}. Puste pola wymagają decyzji. Zmiana pola oznacza ręczne czasowanie.</small>
   <div className="caption-word-table"><div className="caption-word-row"><span>Słowo</span><span>Od</span><span>Do</span><span>Odsłuch</span></div>{draft.rows.map((w,i)=><div className="caption-word-row" key={i} data-origin={w.origin??'uncertain'}><span title={w.origin==='inherited'?'Czas odziedziczony, bez nowej weryfikacji audio':w.origin==='reanalyzed'?'Propozycja Whisper':'Czas ręczny lub nieuzupełniony'}>{w.text}</span>{(['start','end'] as const).map(edge=><input key={edge} type="number" min={0} max={duration} step="0.01" aria-label={`${edge==='start'?'Początek':'Koniec'} słowa ${i+1}`} value={w[edge]??''} disabled={locked||running} onChange={e=>update(i,edge,e.target.valueAsNumber)}/>)}<button disabled={w.start===undefined} aria-label={`Odsłuch od słowa ${i+1}`} onClick={()=>onSeek(caption.start+(w.start??0))}>Idź</button><div className="caption-word-mark"><button disabled={locked||running||time<caption.start||time>caption.end} onClick={()=>update(i,'start',captionPlayheadTime(time,caption.start,caption.end))}>Od głowicy</button><button disabled={locked||running||time<caption.start||time>caption.end} onClick={()=>update(i,'end',captionPlayheadTime(time,caption.start,caption.end))}>Do głowicy</button></div></div>)}</div>
   <div className="caption-timing-actions"><button disabled={locked||running} onClick={()=>void accept()}>Zastosuj czasy słów</button><button disabled={running} onClick={()=>{setDraft(null);setError('');setStatus('');}}>Odrzuć czasy</button></div><small>Zatwierdzenie tworzy osobny krok Undo. Spacja odtwarza montaż; „Idź” ustawia głowicę.</small>
  </>}
 </section>;
}
