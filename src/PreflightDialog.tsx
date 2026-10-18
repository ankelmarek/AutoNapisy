import {formatTime} from './model';
import type {PreflightIssue} from './preflight';
import TaskDialog from './TaskDialog';
import Icon from './Icons';
export default function PreflightDialog({issues,onClose,onExport,onSeek,onLocate}:{issues:PreflightIssue[];onClose:()=>void;onExport:()=>void;onSeek:(time:number)=>void;onLocate:(id:string)=>void}){
 const errors=issues.filter(i=>i.severity==='error'),warnings=issues.filter(i=>i.severity==='warning');
 return <TaskDialog title="Sprawdzenie przed eksportem" busy={false} onClose={onClose}><div className="source-task-body"><p>{errors.length?`${errors.length} błędów blokuje eksport.`:warnings.length?'Eksport jest możliwy. Sprawdź poniższe ostrzeżenia.':'Źródła są dostępne. Nie znaleziono przerw bez widocznego filmu.'}</p><p className="hint">Sprawdzono dostępność i parametry źródeł oraz pokrycie osi widocznym obrazem. Ten raport nie mierzy głośności, ciszy ani czarnych klatek wewnątrz nagrań. Nie ocenia położenia napisów ani kadrowania.</p>
 <ul className="preflight-list">{issues.map((issue,index)=><li key={index} className={issue.severity}><Icon name={issue.severity==='error'?'saveError':'video'} size={18}/><div><b>{issue.severity==='error'?'Błąd':'Ostrzeżenie'}</b><p>{issue.message}</p><div className="preflight-links">{issue.time!==undefined&&<button onClick={()=>onSeek(issue.time!)}>{formatTime(issue.time)}{issue.end!==undefined?` – ${formatTime(issue.end)}`:''} · Pokaż na osi</button>}{issue.sourceId&&<button onClick={()=>onLocate(issue.sourceId!)}>Pokaż plik w bibliotece</button>}</div></div></li>)}</ul></div>
 <div className="source-task-actions"><button onClick={onClose}>Wróć do montażu</button><button className="primary" disabled={!!errors.length} onClick={onExport}>{warnings.length?'Eksportuj mimo ostrzeżeń':'Kontynuuj eksport MP4'}</button></div></TaskDialog>;
}
