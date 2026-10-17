import {useEffect,useRef,useState} from 'react';
import type {Clip} from './editing';
import {audioGain,editVolumePoint,removeVolumePoint,setFade,visibleFade} from './audioEnvelope';
import Icon from './Icons';
function NumberEdit({value,min,max,label,step=.01,onCommit}:{value:number;min:number;max:number;label:string;step?:number;onCommit:(v:number)=>void}){
 const [text,setText]=useState(String(Number(value.toFixed(3)))),editing=useRef(false),cancel=useRef(false);
 useEffect(()=>{if(!editing.current)setText(String(Number(value.toFixed(3))));},[value]);
 const finish=()=>{editing.current=false;const v=Number(text);if(!cancel.current&&text!==String(Number(value.toFixed(3)))&&text.trim()&&Number.isFinite(v))onCommit(Math.max(min,Math.min(max,v)));setText(String(Number(value.toFixed(3))));cancel.current=false;};
 return <input type="number" aria-label={label} value={text} min={min} max={max} step={step} onFocus={()=>{editing.current=true;}} onChange={e=>setText(e.target.value)} onBlur={finish} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel.current=true;e.currentTarget.blur();}}}/>;
}
export default function AudioProperties({clip,onChange}:{clip:Clip;onChange:(c:Clip)=>void}){
 const points=(clip.audio?.points??[]).filter(p=>p.time>=clip.sourceIn&&p.time<=clip.sourceOut);
 return <div className="audio-properties">
  <div className="audio-fade-fields">{(['in','out'] as const).map(edge=><label key={edge}>Fade {edge} · s<NumberEdit label={`Fade ${edge} w sekundach`} value={visibleFade(clip,edge)} min={0} max={clip.sourceOut-clip.sourceIn} onCommit={v=>{if(v!==visibleFade(clip,edge))onChange(setFade(clip,edge,v));}}/></label>)}</div>
  <p className="hint">Alt+klik na krzywej dodaje punkt. Przeciągnij romb, aby zmienić czas i poziom; Delete usuwa punkt. Enter lub wyjście z pola zatwierdza wartość. Odsłuch po zakończeniu gestu.</p>
  {!!points.length&&<div className="audio-points-list"><b>Punkty głośności</b>{points.map((p,i)=><div className="audio-point-row" key={p.id}><label>Czas w klipie · s<NumberEdit label={`Czas punktu ${i+1}`} value={p.time-clip.sourceIn} min={0} max={clip.sourceOut-clip.sourceIn} onCommit={t=>{if(Math.abs(t+clip.sourceIn-p.time)>1e-6)onChange(editVolumePoint(clip,p.id,t+clip.sourceIn,p.gain));}}/></label><label>Poziom · %<NumberEdit label={`Poziom punktu ${i+1}`} value={p.gain*100} min={0} max={100} step={1} onCommit={v=>{if(Math.abs(v/100-p.gain)>1e-6)onChange(editVolumePoint(clip,p.id,p.time,v/100));}}/></label><button aria-label={`Usuń punkt ${i+1}`} title={`Usuń punkt ${i+1}`} onClick={()=>onChange(removeVolumePoint(clip,p.id))}><Icon name="trash" size={14}/></button><small>Wynik: {Math.round(audioGain(clip,p.time)*100)}%</small></div>)}</div>}
  {!!clip.audio&&<button onClick={()=>onChange({...clip,audio:undefined})}>Reset fade i punktów</button>}
 </div>;
}
