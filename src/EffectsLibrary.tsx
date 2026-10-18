import {useState} from 'react';
import {transitionKinds,transitionLabels} from './transitionCatalog';
import type {TransitionKind} from './effects';
import TransitionDemo,{demoUrl,useReducedMotion} from './TransitionDemo';
import Icon from './Icons';
export type EffectChoice={kind:TransitionKind;duration:number};
export default function EffectsLibrary({chosen,onChoose}:{chosen:EffectChoice;onChoose:(choice:EffectChoice)=>void}){
 const duration=chosen.duration,reduced=useReducedMotion();
 const [paused,setPaused]=useState(false),[hovered,setHovered]=useState<TransitionKind|null>(null),[focused,setFocused]=useState<TransitionKind|null>(null),[failed,setFailed]=useState<TransitionKind|null>(null);
 const active=reduced||paused?null:hovered??focused;
 return <div className="effects-library" id="effects-panel" aria-labelledby="effects-tab" role="tabpanel">
  <div className="effects-heading"><h3>Przejścia</h3><button className="icon-button" aria-label={paused?'Włącz podglądy przejść':'Wstrzymaj podglądy przejść'} aria-pressed={paused} disabled={reduced} title={reduced?'Animacje wyłączone w ustawieniach systemu':paused?'Włącz podglądy':'Wstrzymaj podglądy'} onClick={()=>setPaused(v=>!v)}><Icon name={paused||reduced?'play':'pause'} size={16}/></button></div>
  <p className="effects-help">Przeciągnij na łączenie ujęć lub wybierz efekt i kliknij łączenie.</p>
  <label>Długość: {duration.toFixed(2)} s<input aria-label="Długość nowego przejścia" type="range" min={.1} max={2} step={.05} value={duration} onChange={e=>onChoose({...chosen,duration:Number(e.target.value)})}/></label>
  <div className="effects-grid" onMouseLeave={()=>setHovered(null)}>{transitionKinds.map(kind=>{
   const label=transitionLabels[kind];return <button key={kind} className={`effect-card ${chosen.kind===kind?'chosen':''}`} draggable aria-label={label} aria-describedby={`effect-tip-${kind}`} aria-pressed={chosen.kind===kind} title={`${label} · ${duration.toFixed(2)} s · przeciągnij na łączenie`} onMouseEnter={()=>{setHovered(kind);setFailed(null);}} onFocus={()=>{setHovered(null);setFocused(kind);setFailed(null);}} onBlur={()=>setFocused(null)} onClick={()=>onChoose({kind,duration})} onKeyDown={e=>{if(e.key!=='Escape')return;e.preventDefault();e.stopPropagation();setPaused(true);}} onDragStart={e=>{setHovered(null);setFocused(null);onChoose({kind,duration});e.dataTransfer.setData('application/x-rolvixa-transition',JSON.stringify({kind,duration}));e.dataTransfer.effectAllowed='copy';}}>
    <span className="effect-demo"><img src={demoUrl('a.png')} alt="" draggable={false}/><img src={demoUrl('b.png')} alt="" draggable={false}/>{active===kind&&failed!==kind&&<TransitionDemo key={kind} kind={kind} duration={duration} onError={()=>setFailed(kind)}/>}<span className="effect-demo-badge">{active===kind&&failed===kind?'Brak podglądu':`${duration.toFixed(2)} s`}</span></span><span className="effect-label">{label}</span><span id={`effect-tip-${kind}`} role="tooltip" className="effect-tooltip">Enter: wybierz · Esc: zatrzymaj podglądy</span>
   </button>;
  })}</div>
  <p className="effects-motion-hint">{reduced?'Podglądy wyłączone — ograniczony ruch w systemie.':paused?'Podglądy wstrzymane.':'Najedź lub wybierz klawiaturą, aby obejrzeć przejście.'}</p>
 </div>;
}
