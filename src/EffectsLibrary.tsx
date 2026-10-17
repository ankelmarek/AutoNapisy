import {useState} from 'react';
import {transitionKinds,transitionLabels} from './transitionCatalog';
import type {TransitionKind} from './effects';
export type EffectChoice={kind:TransitionKind;duration:number};
export default function EffectsLibrary({chosen,onChoose}:{chosen:EffectChoice;onChoose:(choice:EffectChoice)=>void}){
 const [duration,setDuration]=useState(chosen.duration);
 return <div className="effects-library" role="tabpanel"><h3>Przejścia</h3><p>Przeciągnij na łączenie sąsiednich filmów na jednej ścieżce. Możesz też zaznaczyć efekt i kliknąć łączenie.</p><label>Długość: {duration.toFixed(2)} s<input aria-label="Długość nowego przejścia" type="range" min={.1} max={2} step={.05} value={duration} onChange={e=>{setDuration(Number(e.target.value));onChoose({...chosen,duration:Number(e.target.value)});}}/></label>
  {transitionKinds.map(kind=>[kind,transitionLabels[kind]] as const).map(([kind,label])=><button key={kind} className={`effect-card ${chosen.kind===kind?'chosen':''}`} draggable onClick={()=>onChoose({kind,duration})} onDragStart={e=>{onChoose({kind,duration});e.dataTransfer.setData('application/x-rolvixa-transition',JSON.stringify({kind,duration}));e.dataTransfer.effectAllowed='copy';}}><span className={`effect-demo ${kind}`}><i/><b/></span><span>{label}</span></button>)}
 </div>;
}
