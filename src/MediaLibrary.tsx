import {useState} from 'react';
import type {Project} from './model';
import {formatTime} from './model';
import {libraryItems} from './library';
import Icon from './Icons';
export default function MediaLibrary({project,sources,locked,onAdd,onTranscript,onImport}:{project:Project;sources:Record<string,string>;locked:boolean;onAdd:(id:string)=>void;onTranscript:(id:string)=>void;onImport:()=>void}){
 const [query,setQuery]=useState(''),items=libraryItems(project),filtered=items.filter(m=>`${m.name} ${m.path}`.toLocaleLowerCase('pl').includes(query.toLocaleLowerCase('pl')));
 return <div className="library-content" role="tabpanel" id="files-panel" aria-labelledby="files-tab">
  <div className="library-tools"><label className="library-search"><Icon name="search" size={15}/><input aria-label="Szukaj pliku w projekcie" placeholder="Szukaj pliku…" value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="icon-button" aria-label="Importuj plik wideo" title="Importuj plik wideo" disabled={locked} onClick={onImport}><Icon name="add"/></button></div>
  <div className="library-list">
   {filtered.map(m=><article className={`library-file ${sources[m.path]?'':'unavailable'}`} key={m.id}>
    <div className="file-heading"><span className={`file-kind ${m.kind}`}><Icon name={m.kind==='audio'?'audio':'video'} size={21}/></span><div><b title={m.name}>{m.name}</b><small>{m.kind==='audio'?'Audio':'Wideo'} · {m.duration==null?'Nieznany czas':formatTime(m.duration)} · użycia: {m.uses}</small></div></div>
    <p className="file-path" title={m.path}>{m.path}</p>
    <div className="file-actions"><span className={sources[m.path]?'file-local':'file-missing'}>{sources[m.path]?'● Plik lokalny':'● Niedostępny plik'}</span><button className="icon-button" aria-label={`Dodaj na oś: ${m.name}`} title="Dodaj plik na oś w pozycji głowicy" disabled={locked||!sources[m.path]||!m.duration} onClick={()=>onAdd(m.id)}><Icon name="add" size={16}/></button>{m.kind==='video'&&<button className="icon-button" aria-label={`Napisy pliku: ${m.name}`} title="Przejdź do napisów tego filmu" onClick={()=>onTranscript(m.id)}><Icon name="captions" size={16}/></button>}</div>
   </article>)}
   {!filtered.length&&<div className="empty"><Icon name="files" size={38}/><h3>{items.length?'Brak wyników':'Pliki Twojego projektu'}</h3><p>{items.length?'Zmień wyszukiwaną nazwę.':'Zaimportuj film lub audio. Tutaj znajdziesz wszystkie źródła, także po usunięciu ich z osi czasu.'}</p>{!items.length&&<button disabled={locked} onClick={onImport}>Importuj film</button>}</div>}
  </div><p className="library-note">{items.length} plików · Źródła pozostają na Twoim komputerze.</p>
 </div>;
}
