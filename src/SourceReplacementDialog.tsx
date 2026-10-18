import {useState} from 'react';
import type {Project} from './model';
import {formatTime} from './model';
import {libraryItems} from './library';
import {replacementConflicts,replacementWarnings,type Replacement,type ReplacementPolicy} from './sourceReplacement';
import TaskDialog from './TaskDialog';
export default function SourceReplacementDialog({project,id,candidate,locate,busy,error,onClose,onChoose,onApply}:{project:Project;id:string;candidate:Replacement;locate:boolean;busy:boolean;error:string;onClose:()=>void;onChoose:()=>void;onApply:(policy:ReplacementPolicy)=>void}){
 const [keepCaptions,setKeepCaptions]=useState(false),[sameMaterial,setSameMaterial]=useState(false);
 const item=libraryItems(project).find(a=>a.id===id),policy={keepCaptions:sameMaterial||keepCaptions,sameMaterial:locate&&sameMaterial},conflicts=replacementConflicts(project,id,candidate,policy),info=candidate.info;
 return <TaskDialog title={locate?'Odnajdź źródło':'Zastąp źródło'} busy={busy} onClose={onClose}>
  <div className="source-task-body"><p><b>{item?.name}</b> · {item?.uses??0} użyć w montażu</p><p className="source-path" title={candidate.path}>{candidate.name}<small>{candidate.path}</small></p>
  <dl className="source-metadata"><dt>Czas</dt><dd>{formatTime(item?.duration??0)} → {formatTime(info.duration)}</dd><dt>Obraz</dt><dd>{info.videoStreams?`${info.width}×${info.height} · ${info.fps?.toFixed(2)??'—'} FPS · obrót ${info.rotation}°`:'Brak'}</dd><dt>Dźwięk</dt><dd>{info.audioStreams} strumieni · {info.audioChannels??'—'} kanałów · {info.sampleRate??'—'} Hz</dd></dl>
  {replacementWarnings(candidate).map(w=><p className="source-warning" key={w}>{w}</p>)}
  <p>Cięcia, pozycje, kadrowanie, efekty i ustawienia dźwięku pozostaną zachowane. Podmiana stanowi jeden krok Cofnij.</p>
  {locate?<label className="source-choice"><input type="checkbox" checked={sameMaterial} disabled={busy} onChange={e=>setSameMaterial(e.target.checked)}/>Potwierdzam: to ten sam materiał. Zachowaj napisy i dane licencji.</label>:<><label className="source-choice"><input type="checkbox" checked={keepCaptions} disabled={busy} onChange={e=>setKeepCaptions(e.target.checked)}/>Świadomie zachowaj dotychczasowe napisy — pasują do nowej wypowiedzi.</label><p className="hint">Dane autorstwa i licencji poprzedniego pliku nie zostaną przypisane zamiennikowi.</p></>}
  {!policy.keepCaptions&&<p className="source-warning">Napisy tego źródła zostaną usunięte. {project.timelineSegments!==null&&!!item?.uses?'Transkrypcja całego montażu również zostanie wyczyszczona, ponieważ nie jest przypisana do poszczególnych źródeł. ':''}Po podmianie uruchom transkrypcję ponownie. Cofnij przywróci poprzednie napisy.</p>}
  {!!conflicts.length&&<div className="source-conflicts" role="alert"><b>Nie można zastosować zamiennika</b><ul>{conflicts.map((c,i)=><li key={i}>{c.time!==undefined&&<code>{formatTime(c.time)} · </code>}{c.message}</li>)}</ul><p>Wybierz inny plik albo anuluj i popraw wskazane ujęcia. Montaż nie zostanie skrócony automatycznie.</p></div>}
  {error&&<p role="alert" className="source-conflicts">{error}</p>}</div>
  <div className="source-task-actions"><button disabled={busy} onClick={onChoose}>Wybierz inny plik</button><button disabled={busy} onClick={onClose}>Anuluj</button><button className="primary" disabled={busy||!!conflicts.length||(locate&&!sameMaterial)} onClick={()=>onApply(policy)}>{busy?'Sprawdzanie…':'Zastosuj źródło'}</button></div>
 </TaskDialog>;
}
