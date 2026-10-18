import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {formatTime,serializeProject,type Project} from './model';
import type {PreflightIssue} from './preflight';
import {useQualityAnalysis,qualityIssues,normalizationSuggestion,type NormalizationPlan} from './qualityAnalysis';
import TaskDialog from './TaskDialog';
import Icon from './Icons';
export default function PreflightDialog({project,issues,autoAnalyze,onClose,onExport,onNormalize,onSeek,onLocate}:{project:Project;issues:PreflightIssue[];autoAnalyze:boolean;onClose:()=>void;onExport:()=>void;onNormalize:(plan:NormalizationPlan,target:number)=>void;onSeek:(time:number)=>void;onLocate:(id:string)=>void}){
 const analysis=useQualityAnalysis(),[targetText,setTargetText]=useState('-14'),[applying,setApplying]=useState(false),[error,setError]=useState('');
 const target=Number(targetText);
 const baseErrors=issues.some(i=>i.severity==='error');
 useEffect(()=>{if(!autoAnalyze||baseErrors)return;const timer=setTimeout(()=>void analysis.start(project),0);return()=>clearTimeout(timer);},[]);
 const report=analysis.status?.state==='completed'?analysis.status.report:null,all=[...issues,...(report?qualityIssues(report):[])];
 const errors=all.filter(i=>i.severity==='error'),warnings=all.filter(i=>i.severity==='warning'),plan=report?normalizationSuggestion(report.raw,target):null;
 const normalize=async()=>{if(!report||!analysis.status||applying)return;setApplying(true);setError('');try{const verified=await invoke<NormalizationPlan>('plan_normalization',{id:analysis.status.id,json:serializeProject(project),target});onNormalize(verified,target);}catch(e){setError(String(e));}finally{setApplying(false);}};
 const meter=(n:number|null,unit:string)=>n===null?'—':`${n.toFixed(1)} ${unit}`;
 return <TaskDialog title="Sprawdzenie przed eksportem" busy={analysis.running||applying} onClose={onClose}><div className="source-task-body">
 <p>{errors.length?`Błędy blokujące eksport: ${errors.length}.`:warnings.length?'Eksport jest możliwy. Sprawdź poniższe ostrzeżenia.':'Podstawowe sprawdzenie nie wykazało problemów.'}</p>
 <p className="hint">Sprawdzono źródła, przerwy w obrazie i granice napisów{issues.some(i=>i.kind==='caption')?' — sprawdź wskazane napisy':''}. Pełna analiza mierzy rzeczywisty miks i obraz montażu, przed nałożeniem napisów. Wybrana strefa bezpieczna dotyczy formatu 9:16.</p>
 <section className="quality-analysis" aria-label="Analiza obrazu i dźwięku"><h3><Icon name="audio" size={18}/> Obraz i dźwięk</h3>
 <div className="quality-actions"><button disabled={baseErrors||analysis.running||applying} onClick={()=>void analysis.start(project)}>{report?'Sprawdź ponownie':'Uruchom pełną analizę'}</button>{analysis.running&&<button onClick={analysis.cancel}>Anuluj analizę</button>}</div>
 {analysis.running&&<div role="status"><p>{analysis.status?.message??'Przygotowywanie analizy…'}</p><progress aria-label="Postęp analizy" max={100} value={analysis.status?.progress??undefined}/></div>}
 {analysis.status?.state==='cancelled'&&<p role="status">Anulowano analizę. Raport podstawowy jest dostępny.</p>}
 {analysis.error&&<p className="error" role="alert">Nie ukończono pełnej analizy: {analysis.error}. Możesz wrócić do montażu lub skorzystać z raportu podstawowego.</p>}
 {report&&<><dl className="quality-meters"><div><dt>Głośność miksu</dt><dd data-quality-lufs>{meter(report.current.integratedLufs,'LUFS')}</dd></div><div><dt>Szczyt rzeczywisty</dt><dd data-quality-peak>{meter(report.current.truePeakDb,'dBTP')}</dd></div></dl><p className="hint">{analysis.status?.cached?'Aktualny wynik z pamięci. ':''}Cisza: &lt; −50 dB / 0,5 s. Czarny obraz: ≥98% ciemnych pikseli / 0,15 s. Szczyty na osi: dokładność ok. 0,1 s. Ciemne sceny i pauzy mogą być zamierzone.</p>
 <div className="normalization"><h3>Normalizacja całego miksu</h3><label>Docelowa głośność<select aria-label="Docelowa głośność" value={[-14,-16,-23].includes(target)?target:'custom'} onChange={e=>{if(e.target.value==='custom')setTargetText('-18');else setTargetText(e.target.value);}}><option value={-14}>−14 LUFS · rolki / internet</option><option value={-16}>−16 LUFS · mowa / podcast</option><option value={-23}>−23 LUFS · EBU R128</option><option value="custom">Własna</option></select></label><label>Cel LUFS<input aria-label="Cel LUFS" type="number" min={-30} max={-9} step={1} value={targetText} onChange={e=>setTargetText(e.currentTarget.value)}/></label>
 {plan?<><p>Wzmocnienie: <b>{plan.gainDb>0?'+':''}{plan.gainDb.toFixed(1)} dB</b>. Przewidywane: {plan.predictedLufs.toFixed(1)} LUFS / {plan.predictedPeakDb.toFixed(1)} dBTP.</p>{plan.limited&&<p role="status">Wybrany cel jest ograniczony przez szczyty lub zakres wzmocnienia. Zachowamy dynamikę i zastosujemy wskazany osiągalny poziom.</p>}<button className="primary" disabled={analysis.running||applying} onClick={()=>void normalize()}>{applying?'Zatwierdzanie…':'Zastosuj normalizację'}</button></>:<p>Brak stabilnego pomiaru lub cel poza zakresem −30…−9 LUFS.</p>}
 <p className="hint">Stałe wzmocnienie zachowuje proporcje ścieżek, obwiednie i wyciszenia. Limit obliczeń: −1,1 dBTP; kodowanie AAC może nieznacznie zmienić szczyty. Po zmianie montażu zmierz miks ponownie.</p></div></>}
 {error&&<p className="error" role="alert">{error}</p>}
 </section>
 <ul className="preflight-list">{all.map((issue,index)=><li key={index} className={issue.severity}><Icon name={issue.severity==='error'?'saveError':issue.kind==='audio'?'audio':'video'} size={18}/><div><b>{issue.severity==='error'?'Błąd':'Ostrzeżenie'}</b><p>{issue.message}</p><div className="preflight-links">{issue.time!==undefined&&<button disabled={analysis.running||applying} onClick={()=>onSeek(issue.time!)}>{formatTime(issue.time)}{issue.end!==undefined?` – ${formatTime(issue.end)}`:''} · Pokaż na osi</button>}{issue.sourceId&&<button disabled={analysis.running||applying} onClick={()=>onLocate(issue.sourceId!)}>Pokaż plik w bibliotece</button>}</div></div></li>)}</ul></div>
 <div className="source-task-actions"><button disabled={analysis.running||applying} onClick={onClose}>Wróć do montażu</button><button className="primary" disabled={!!errors.length||analysis.running||applying} onClick={onExport}>{warnings.length?'Eksportuj mimo ostrzeżeń':'Kontynuuj eksport MP4'}</button></div></TaskDialog>;
}
