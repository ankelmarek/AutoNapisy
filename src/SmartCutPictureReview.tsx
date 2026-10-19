import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import type {Project} from './model';
import type {VisualAnalysis} from './smartCutVisual';
import Icon from './Icons';

export function useSmartCutVisual(project:Project|null,at:number){
 const json=project?JSON.stringify(project):'',identity=json+':'+at;
 const [revision,setRevision]=useState(0),[result,setResult]=useState<{identity:string;analysis?:VisualAnalysis;error?:string}>({identity:''});
 useEffect(()=>{
  if(!json)return;
  let alive=true;const key=crypto.randomUUID();setResult({identity});
  const timer=setTimeout(()=>{void invoke<VisualAnalysis>('analyze_smartcut_visual',{json,key,at}).then(analysis=>{if(alive)setResult({identity,analysis});}).catch(e=>{if(alive)setResult({identity,error:String(e)});});},400);
  return()=>{alive=false;clearTimeout(timer);void invoke('cancel_smartcut',{key}).catch(()=>{});};
 },[identity,revision]);
 const current=result.identity===identity?result:null,analysis=current?.analysis??null;
 return {analysis,error:current?.error??'',loading:!!json&&!analysis&&!current?.error,retry:()=>setRevision(n=>n+1),validate:async()=>{if(analysis)await invoke('validate_smartcut_visual',{key:analysis.key,json});}};
}
const time=(n:number)=>`${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toFixed(3).padStart(6,'0')}`;
export default function SmartCutPictureReview({analysis,error,loading,retry,offset,unavailable,disabled}:{analysis:VisualAnalysis|null;error:string;loading:boolean;retry:()=>void;offset:number;unavailable:string;disabled:boolean}){
 return <section className="smartcut-picture" aria-label="Obraz przy cięciu" aria-busy={loading}>
  <div className="smartcut-picture-heading"><h3><Icon name="video" size={15}/> Obraz przy cięciu</h3><button className="icon-button" aria-label="Ponów porównanie obrazu" disabled={disabled||loading||!!unavailable} onClick={retry}><Icon name="restore" size={14}/></button></div>
  {analysis&&<><div className="smartcut-stills">{([['before','Ostatnia klatka przed'],['after','Pierwsza klatka po']] as const).map(([id,label])=><figure key={id}><img src={`data:image/png;base64,${analysis[id].png}`} alt={label}/><figcaption>{label} <code>{time(offset+analysis[id].time)}</code></figcaption></figure>)}</div><p className={`smartcut-picture-status ${analysis.verdict}`} role="status"><Icon name={analysis.verdict==='jump'?'saveError':'search'} size={15}/>{analysis.message}</p><details><summary>Jak czytać porównanie</summary><p>{analysis.detail} Zamierzona zmiana ujęcia może zostać oznaczona. Przebitkę oglądasz w podglądzie powyżej; te klatki pokazują samo cięcie.</p></details></>}
  {!analysis&&<p className="smartcut-picture-status" role="status">{unavailable|| (loading?'Porównywanie rzeczywistych klatek montażu…':`Porównanie obrazu niedostępne: ${error}. Cięcie dokładne nadal jest dostępne.`)}</p>}
 </section>;
}
