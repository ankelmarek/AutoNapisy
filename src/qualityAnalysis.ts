import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {serializeProject,type Project} from './model';
import type {PreflightIssue} from './preflight';
export type Meter={integratedLufs:number|null;truePeakDb:number|null;peakTime:number|null};
export type Interval={start:number;end:number};
export type QualityReport={key:string;width:number;height:number;duration:number;raw:Meter;current:Meter;silence:Interval[];black:Interval[];peaks:Interval[];truncated:boolean};
export type QualityStatus={id:number;state:string;message:string;progress:number|null;report:QualityReport|null;cached:boolean};
export type NormalizationPlan={gainDb:number;predictedLufs:number;predictedPeakDb:number;limited:boolean};
export function qualityIssues(r:QualityReport):PreflightIssue[]{
 const out:PreflightIssue[]=[];
 if(r.current.truePeakDb!==null&&r.current.truePeakDb>=0)out.push({severity:'warning',kind:'audio',time:r.current.peakTime??undefined,message:`Szczyt ${r.current.truePeakDb.toFixed(1)} dBTP: ryzyko przesterowania miksu.`});
 for(const s of r.peaks)out.push({severity:'warning',kind:'audio',time:s.start,end:s.end,message:'Miks osiąga 0 dBFS. Sprawdź przesterowanie lub zmniejsz głośność.'});
 for(const s of r.silence)out.push({severity:'warning',kind:'audio',time:s.start,end:s.end,message:'Cisza poniżej −50 dB przez co najmniej 0,5 s. Może być zamierzona.'});
 for(const s of r.black)out.push({severity:'warning',kind:'black',time:s.start,end:s.end,message:'Czarny lub bardzo ciemny obraz przez co najmniej 0,15 s. Może być zamierzony.'});
 if(r.current.integratedLufs===null)out.push({severity:'warning',kind:'audio',message:'Brak stabilnego pomiaru LUFS: materiał jest zbyt cichy, krótki lub zawiera tylko ciszę.'});
 if(r.truncated)out.push({severity:'warning',message:'Raport ma limit 1000 zakresów na kategorię. Pokazano pierwsze wyniki.'});
 return out;
}
export function normalizationSuggestion(raw:Meter,target:number):NormalizationPlan|null{
 if(raw.integratedLufs===null||raw.truePeakDb===null||!Number.isFinite(target)||target< -30||target> -9)return null;
 const wanted=target-raw.integratedLufs,gainDb=Math.max(-60,Math.min(24,wanted,-1.1-raw.truePeakDb));
 if(raw.truePeakDb+gainDb> -1)return null;
 return {gainDb,predictedLufs:raw.integratedLufs+gainDb,predictedPeakDb:raw.truePeakDb+gainDb,limited:Math.abs(wanted-gainDb)>.05};
}
export function useQualityAnalysis(){
 const [status,setStatus]=useState<QualityStatus|null>(null),[error,setError]=useState(''),[running,setRunning]=useState(false);
 const generation=useRef(0),current=useRef(0),cancelled=useRef(false),active=useRef(false),mounted=useRef(true);
 const cancel=()=>{cancelled.current=true;if(current.current)void invoke('cancel_quality_analysis',{id:current.current}).catch(e=>{if(mounted.current)setError(String(e));});};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;cancel();};},[]);
 const start=async(project:Project)=>{
  if(active.current)return;active.current=true;const token=++generation.current;cancelled.current=false;current.current=0;setStatus(null);setError('');setRunning(true);
  try{
   const id=await invoke<number>('start_quality_analysis',{json:serializeProject(project)});current.current=id;
   if(!mounted.current||token!==generation.current||cancelled.current){await invoke('cancel_quality_analysis',{id});if(!mounted.current||token!==generation.current)return;}
   while(mounted.current&&token===generation.current){
    const s=await invoke<QualityStatus>('quality_analysis_status',{id});if(!mounted.current||token!==generation.current)return;
    if(cancelled.current&&s.state==='completed'){setStatus({...s,state:'cancelled',report:null,message:'Anulowano analizę'});return;}
    setStatus(s);if(['completed','cancelled'].includes(s.state))return;if(s.state==='failed')throw Error(s.message);
    await new Promise(r=>setTimeout(r,250));
   }
  }catch(e){if(mounted.current&&token===generation.current)setError(String(e));}
  finally{active.current=false;if(mounted.current&&token===generation.current)setRunning(false);}
 };
 return {status,error,running,start,cancel};
}
