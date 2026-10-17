import {useRef,useState,type PointerEvent} from 'react';
export const dragVolume=(initial:number,dy:number)=>Math.round(Math.max(0,Math.min(1,initial-dy/80))*100)/100;
export default function VolumeLine({value,name,disabled,onPreview,onCommit}:{value:number;name:string;disabled:boolean;onPreview:(gain:number)=>void;onCommit:(gain:number)=>void}){
 const drag=useRef<{y:number;initial:number;value:number}|null>(null),[draft,setDraft]=useState<number|null>(null);
 const gain=draft??value;
 const finish=(e:PointerEvent,cancel=false)=>{e.stopPropagation();const d=drag.current;if(!d)return;drag.current=null;setDraft(null);if(cancel)onPreview(value);else if(d.value!==d.initial)onCommit(d.value);};
 return <div role="slider" aria-label={`Głośność: ${name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(gain*100)} aria-valuetext={`${Math.round(gain*100)}%`} aria-orientation="vertical" aria-disabled={disabled} tabIndex={disabled?-1:0}
  className={`audio-volume-line ${draft!=null?'adjusting':''}`} style={{top:4+(1-gain)*17}}
  title={`Głośność ${Math.round(gain*100)}% · przeciągnij góra–dół · ↑↓ 1%, Shift 10%`}
  onPointerDown={e=>{e.stopPropagation();if(disabled||e.button!==0)return;e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={y:e.clientY,initial:value,value};setDraft(value);}}
  onPointerMove={e=>{e.stopPropagation();const d=drag.current;if(!d)return;d.value=dragVolume(d.initial,e.clientY-d.y);setDraft(d.value);onPreview(d.value);}}
  onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)}
  onKeyDown={e=>{e.stopPropagation();if(disabled)return;const step=e.shiftKey?.1:.01;let next=value;if(e.key==='ArrowUp'||e.key==='ArrowRight')next=Math.min(1,value+step);else if(e.key==='ArrowDown'||e.key==='ArrowLeft')next=Math.max(0,value-step);else if(e.key==='Home')next=0;else if(e.key==='End')next=1;else return;e.preventDefault();next=Math.round(next*100)/100;onPreview(next);onCommit(next);}}>
  <span className="volume-wire"/><span className="volume-percent">{Math.round(gain*100)}%</span>
 </div>;
}
