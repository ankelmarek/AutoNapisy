import {useEffect,useRef} from 'react';
import Icon from './Icons';
import rolvixaIcon from './assets/rolvixa-icon.png';
import type {useRecentProjects} from './recentProjects';
type Props={recent:ReturnType<typeof useRecentProjects>;busy:boolean;error:string;canReturn:boolean;onNew:()=>void;onOpen:()=>void;onRecent:(id:string)=>void;onDismiss:()=>void;onReturn:()=>void};
export default function StartScreen(p:Props){
 const host=useRef<HTMLElement>(null);
 useEffect(()=>{host.current?.querySelector<HTMLButtonElement>('.start-new')?.focus();},[]);
 return <main className="start-screen" ref={host} aria-label="Ekran startowy">
  <div className="start-brand"><img src={rolvixaIcon} alt=""/><b>RolVixa</b><span>Twój kolejny montaż</span></div>
  <section className="start-heading"><div><h1>Co dziś tworzymy?</h1><p>Rozpocznij nowy projekt lub wróć do ostatniego montażu.</p></div><div className="start-actions">
   <button className="start-new primary" disabled={p.busy} onClick={p.onNew}><Icon name="new" size={19}/>Nowy projekt</button>
   <button disabled={p.busy} onClick={p.onOpen}><Icon name="open" size={19}/>Otwórz projekt</button>
   {p.canReturn&&<button disabled={p.busy} onClick={p.onReturn}><Icon name="chevronLeft" size={16}/>Wróć do montażu</button>}
  </div></section>
  <section className="recent-section" aria-labelledby="recent-heading"><div className="recent-heading"><h2 id="recent-heading">Ostatnie projekty</h2><button className="icon-button" title="Odśwież historię" aria-label="Odśwież historię" disabled={p.recent.loading||p.recent.pending||p.busy} onClick={()=>void p.recent.refresh()}><Icon name="restore" size={16}/></button></div>
   {(p.error||p.recent.warning)&&<div className="start-warning" role="alert"><p>{p.error||`Historia projektów: ${p.recent.warning}`}</p>{p.error&&<button aria-label="Zamknij komunikat" onClick={p.onDismiss}>Zamknij</button>}{p.recent.warning&&<button disabled={p.busy||p.recent.pending} onClick={()=>void p.recent.clear()}>Wyczyść historię</button>}</div>}
   {p.recent.loading&&!p.recent.ready&&<p className="start-loading" role="status">Wczytywanie ostatnich projektów…</p>}
   {p.recent.ready&&!p.recent.entries.length&&<div className="recent-empty"><Icon name="files" size={36}/><p>Tu znajdziesz ostatnio otwierane i zapisane projekty.</p></div>}
   <div className="recent-grid">{p.recent.entries.map((entry,i)=><article className={`recent-card recent-color-${i%3}`} key={entry.id} data-recent-id={entry.id}>
    <button className="recent-open" disabled={p.busy||p.recent.pending} aria-label={`Otwórz projekt ${entry.name}`} title={entry.path} onClick={()=>p.onRecent(entry.id)}><span className="recent-art"><Icon name="video" size={40}/><span>PROJEKT</span></span><span className="recent-info"><b>{entry.name}</b><span className="recent-path">{entry.path}</span><time dateTime={new Date(entry.lastUsed).toISOString()}>{new Date(entry.lastUsed).toLocaleString('pl-PL',{dateStyle:'short',timeStyle:'short'})}</time></span></button>
    <button className="recent-remove icon-button" disabled={p.busy||p.recent.pending} aria-label={`Usuń z ostatnich: ${entry.name}`} title="Usuń wpis z historii" onClick={()=>{p.onDismiss();void p.recent.remove(entry.id);}}><Icon name="x" size={15}/></button>
   </article>)}</div>
  </section>
  <div className="start-bottom"><label><input type="checkbox" checked={p.recent.showOnStartup} disabled={p.recent.pending||!p.recent.ready} onChange={e=>void p.recent.preference(e.target.checked)}/>Pokazuj przy uruchomieniu</label><span>Ctrl+N — nowy · Ctrl+O — otwórz</span></div>
 </main>;
}
