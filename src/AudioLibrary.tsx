import {useEffect,useRef,useState} from 'react';
import {convertFileSrc,invoke} from '@tauri-apps/api/core';
import type {Project} from './model';
import {libraryItems} from './library';
import Icon from './Icons';
type Provenance=NonNullable<Project['assets'][number]['provenance']>;
export type LibraryAudio={id:string;name:string;path:string;duration:number;group?:string;provenance?:Provenance};
type Remote={id:string;title:string;creator:string;duration:number;license:string;licenseUrl:string;sourceUrl:string;attribution:string};
type Search={resultCount:number;pageCount:number;results:Remote[]};
const duration=(n:number)=>n<60?`${n.toFixed(n<2?2:0)} s`:`${Math.floor(n/60)}:${Math.floor(n%60).toString().padStart(2,'0')}`;
const licenseName=(s:string)=>s.toLowerCase()==='cc0'?'CC0':s.toUpperCase().startsWith('CC')?s.toUpperCase():`CC ${s.toUpperCase()}`;
export default function AudioLibrary({project,locked,onImport,onRegister,onAdd,onPause,timelinePlaying}:{project:Project;locked:boolean;timelinePlaying:boolean;onImport:()=>void;onRegister:(item:LibraryAudio)=>string;onAdd:(id:string)=>void;onPause:()=>void}){
 const [tab,setTab]=useState<'music'|'sounds'|'own'>('music'),[builtins,setBuiltins]=useState<LibraryAudio[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('commercial'),[result,setResult]=useState<Search|null>(null),[page,setPage]=useState(1),[busy,setBusy]=useState(false),[loadingId,setLoadingId]=useState(''),[playingId,setPlayingId]=useState(''),[soundQuery,setSoundQuery]=useState('');
 const audio=useRef<HTMLAudioElement>(null),alive=useRef(true),request=useRef(0);
 const local=libraryItems(project).filter(m=>m.kind==='audio').map(m=>({...m,duration:m.duration??0,provenance:'provenance'in m?m.provenance:undefined}));
 useEffect(()=>{alive.current=true;const element=audio.current;void invoke<LibraryAudio[]>('builtin_audio').then(v=>{if(alive.current)setBuiltins(v);}).catch(e=>{if(alive.current)setError(String(e));});return()=>{alive.current=false;request.current++;element?.pause();};},[]);
 const stop=()=>{request.current++;audio.current?.pause();setPlayingId('');setLoadingId('');};
 useEffect(()=>{if(timelinePlaying)stop();},[timelinePlaying]);
 const audition=async(item:LibraryAudio)=>{if(item.id===playingId){stop();return;}onPause();stop();const ticket=++request.current;setError('');setLoadingId(item.id);
  try{const path=await invoke<string>('audition_audio',{path:item.path});if(!alive.current||ticket!==request.current)return;const element=audio.current;if(!element)return;element.src=convertFileSrc(path);await element.play();if(alive.current&&ticket===request.current)setPlayingId(item.id);}catch(e){if(alive.current&&ticket===request.current)setError(`Odsłuch: ${String(e)}`);}finally{if(alive.current&&ticket===request.current)setLoadingId('');}
 };
 const search=async(next=1)=>{if(busy||query.trim().length<2)return;setBusy(true);setError('');setMessage('');try{const data=await invoke<Search>('search_audio',{query:query.trim(),page:next,license:filter});if(!alive.current)return;setResult(data);setPage(next);}catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}};
 const download=async(item:Remote)=>{if(busy)return;setBusy(true);setLoadingId(item.id);setError('');setMessage('');try{const local=await invoke<LibraryAudio>('download_audio',{id:item.id});if(!alive.current)return;onRegister(local);setMessage(`Pobrano: ${local.name}`);}catch(e){if(alive.current)setError(String(e));}finally{if(alive.current){setBusy(false);setLoadingId('');}}};
 const drag=(e:React.DragEvent,item:LibraryAudio)=>{if(locked){e.preventDefault();return;}try{const id=onRegister(item);e.dataTransfer.setData('application/x-rolvixa-media',id);e.dataTransfer.effectAllowed='copy';}catch(e){setError(String(e));}};
 const add=(item:LibraryAudio)=>{try{onAdd(onRegister(item));}catch(e){setError(String(e));}};
 const renderLocal=(item:LibraryAudio)=><article className="audio-library-item" key={item.id} draggable={!locked} onDragStart={e=>drag(e,item)} title={`${item.name} · Przeciągnij na A1 lub A2`}>
  <button className="audio-audition" disabled={locked||!!loadingId} onClick={()=>void audition(item)} aria-label={`${playingId===item.id?'Zatrzymaj':'Odsłuchaj'}: ${item.name}`} title="Odsłuch do 30 sekund">{loadingId===item.id?'…':playingId===item.id?'■':'▶'}</button>
  <div className="audio-item-info"><b>{item.name}</b><small>{duration(item.duration)}{item.provenance?` · ${licenseName(item.provenance.license)}`:''}{item.group?` · ${item.group}`:''}</small></div>
  <button className="icon-button" disabled={locked} onClick={()=>add(item)} aria-label={`Dodaj audio na oś: ${item.name}`} title="Dodaj audio w pozycji głowicy"><Icon name="add" size={15}/></button>
  {item.provenance&&<details className="audio-license"><summary>Autor i licencja</summary><p>{item.provenance.creator} · {licenseName(item.provenance.license)}</p><p>{item.provenance.attribution}</p><code>{item.provenance.sourceUrl}</code><code>{item.provenance.licenseUrl}</code><button onClick={()=>void navigator.clipboard.writeText(item.provenance!.attribution+'\n'+item.provenance!.sourceUrl+'\n'+item.provenance!.licenseUrl).then(()=>setMessage('Skopiowano dane licencji.')).catch(()=>setError('Nie udało się skopiować danych licencji.'))}>Kopiuj dane licencji</button></details>}
 </article>;
 return <div className="audio-library" role="tabpanel" id="audio-panel" aria-labelledby="audio-tab">
  <div className="audio-tabs">{([['music','Muzyka'],['sounds','Dźwięki'],['own','Moje audio']] as const).map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>{stop();setTab(id);setError('');setMessage('');}}>{label}</button>)}</div>
  {tab==='music'&&<><form className="audio-search" onSubmit={e=>{e.preventDefault();void search();}}><label><Icon name="search" size={15}/><input aria-label="Szukaj muzyki w Openverse" value={query} maxLength={200} placeholder="Szukaj w Openverse…" onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Licencja muzyki" value={filter} onChange={e=>setFilter(e.target.value)}><option value="commercial">Komercyjnie i do montażu</option><option value="cc0">CC0</option><option value="all">Wszystkie licencje</option></select><button type="submit" disabled={locked||busy||query.trim().length<2}>{busy?'Wyszukiwanie…':'Szukaj'}</button></form>
   <div className="audio-results">
    {local.filter(a=>a.provenance?.provider==='openverse').length>0&&<details className="downloaded-audio"><summary>Pobrane utwory ({local.filter(a=>a.provenance?.provider==='openverse').length})</summary>{local.filter(a=>a.provenance?.provider==='openverse').map(renderLocal)}</details>}
    {result?.results.map(r=>{const downloaded=local.find(a=>a.provenance?.externalId===r.id);return downloaded?renderLocal(downloaded):<article className="remote-audio" key={r.id}><b>{r.title}</b><span>{r.creator||'Autor niepodany'}</span><small>{r.duration?duration(r.duration):'Czas po pobraniu'} · {licenseName(r.license)}</small><details><summary>Warunki wykorzystania</summary><p>{r.attribution}</p><code>{r.licenseUrl}</code><code>{r.sourceUrl}</code></details><button disabled={locked||busy} onClick={()=>void download(r)}>{loadingId===r.id?'Pobieranie…':'Pobierz do projektu'}</button></article>;})}
    {result&&!result.results.length&&<div className="empty"><h3>Brak wyników</h3><p>Spróbuj innej frazy lub zmień filtr licencji.</p></div>}
    {!result&&<div className="empty"><Icon name="audio" size={32}/><h3>Muzyka do Twojego filmu</h3><p>Wpisz frazę i wyszukaj utwory w Openverse. Pobierz wybrany plik, aby go odsłuchać i przeciągnąć na oś.</p></div>}
    {result&&result.pageCount>1&&<div className="audio-paging"><button disabled={busy||page<=1} onClick={()=>void search(page-1)}>←</button><span>{page} / {result.pageCount}</span><button disabled={busy||page>=result.pageCount} onClick={()=>void search(page+1)}>→</button></div>}
   </div></>}
  {tab==='sounds'&&<><label className="sound-search"><input aria-label="Szukaj efektu dźwiękowego" value={soundQuery} onChange={e=>setSoundQuery(e.target.value)} placeholder="Szukaj dźwięku…"/></label><div className="audio-results"><p className="audio-provider">Kenney · Interface Sounds · CC0 · {builtins.length} efektów</p>{builtins.filter(a=>`${a.name} ${a.group}`.toLocaleLowerCase('pl').includes(soundQuery.toLocaleLowerCase('pl'))).map(renderLocal)}</div></>}
  {tab==='own'&&<><button className="audio-import" disabled={locked} onClick={onImport}><Icon name="add" size={15}/>Importuj własne audio</button><div className="audio-results">{local.map(renderLocal)}{!local.length&&<div className="empty"><Icon name="audio" size={32}/><h3>Twoje pliki audio</h3><p>Importuj muzykę, lektora lub własne efekty. Import nie dodaje plików na oś czasu.</p></div>}</div></>}
  {error&&<p className="audio-library-error" role="alert">{error}</p>}{message&&<p className="audio-library-message" role="status">{message}</p>}
  <audio ref={audio} onEnded={()=>setPlayingId('')} onError={()=>{setPlayingId('');setError('Nie udało się odtworzyć pliku audio.');}}/>
 </div>;
}
