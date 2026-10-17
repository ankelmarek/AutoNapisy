import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import type {Clip} from './editing';
import {addVolumePoint,audioGain,clamp,editVolumePoint,envelopeGain,fadeGain,removeVolumePoint,setFade,visibleFade} from './audioEnvelope';
import {dragVolume} from './VolumeLine';
type Gesture={kind:'volume'|'in'|'out'|'point';id?:string;x:number;y:number;initial:Clip;next:Clip};
export default function AudioAutomation({clip,zoom,name,disabled,onBegin,onCommit}:{clip:Clip;zoom:number;name:string;disabled:boolean;onBegin:()=>void;onCommit:(c:Clip)=>void}){
 const root=useRef<HTMLDivElement>(null),baseControl=useRef<HTMLDivElement>(null),drag=useRef<Gesture|null>(null);
 const [draft,setDraft]=useState<Clip|null>(null),[height,setHeight]=useState(25),[menu,setMenu]=useState<{id:string;x:number;y:number}|null>(null);
 const c=draft??clip,width=Math.max(1,(c.sourceOut-c.sourceIn)*zoom),span=Math.max(1,height-13),top=7;
 const y=(gain:number)=>top+(1-clamp(gain))*span,x=(t:number)=>(t-c.sourceIn)*zoom;
 const key=JSON.stringify([clip.audio,clip.volume,clip.sourceIn,clip.sourceOut]);
 useEffect(()=>{drag.current=null;setDraft(null);setMenu(null);},[key]);
 useEffect(()=>{if(!root.current)return;const r=new ResizeObserver(([entry])=>setHeight(entry.contentRect.height));r.observe(root.current);return()=>r.disconnect();},[]);
 useEffect(()=>{if(!menu)return;const close=(e:globalThis.PointerEvent)=>{if(!(e.target as HTMLElement).closest('.audio-point-menu'))setMenu(null);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[menu]);
 const commit=(next:Clip)=>{if(JSON.stringify([next.audio,next.volume])!==JSON.stringify([clip.audio,clip.volume]))onCommit(next);};
 const begin=(e:PointerEvent,kind:Gesture['kind'],id?:string)=>{
  e.stopPropagation();if(disabled||e.button!==0)return;e.preventDefault();setMenu(null);onBegin();
  if(e.altKey&&kind==='volume'){const rect=root.current!.getBoundingClientRect();const next=addVolumePoint(clip,clip.sourceIn+(e.clientX-rect.left)/zoom);commit(next);return;}
  e.currentTarget.setPointerCapture(e.pointerId);if(e.currentTarget instanceof HTMLElement)e.currentTarget.focus();else baseControl.current?.focus();
  drag.current={kind,id,x:e.clientX,y:e.clientY,initial:clip,next:clip};setDraft(clip);
 };
 const move=(e:PointerEvent)=>{const g=drag.current;if(!g)return;e.stopPropagation();const initial=g.initial;
  if(g.kind==='volume')g.next={...initial,volume:dragVolume(initial.volume??1,e.clientY-g.y)};
  else if(g.kind==='in'||g.kind==='out')g.next=setFade(initial,g.kind,visibleFade(initial,g.kind)+(g.kind==='in'?1:-1)*(e.clientX-g.x)/zoom);
  else {const point=initial.audio!.points.find(p=>p.id===g.id)!;const time=clamp(point.time+(e.clientX-g.x)/zoom,initial.sourceIn,initial.sourceOut);const raw=editVolumePoint(initial,g.id!,time,point.gain);const actual=raw.audio!.points.find(p=>p.id===g.id)!;const factor=(initial.volume??1)*fadeGain(initial,actual.time);const target=audioGain(initial,point.time)-(e.clientY-g.y)/span;g.next=editVolumePoint(initial,g.id!,actual.time,Math.abs(e.clientY-g.y)<.5?point.gain:factor>1e-8?target/factor:point.gain);}
  setDraft(g.next);
 };
 const finish=(e:PointerEvent,cancel=false)=>{e.stopPropagation();const g=drag.current;drag.current=null;setDraft(null);if(g&&!cancel)commit(g.next);};
 const points=(c.audio?.points??[]).filter(p=>p.time>=c.sourceIn&&p.time<=c.sourceOut);
 // Sample only the visible clip width, bounded independently of project duration.
 const samples=Math.max(2,Math.min(512,Math.ceil(width/3)));
 const line=Array.from({length:samples+1},(_,i)=>{const t=c.sourceIn+(c.sourceOut-c.sourceIn)*i/samples;return `${i?'L':'M'}${x(t).toFixed(2)},${y(audioGain(c,t)).toFixed(2)}`;}).join(' ');
 const remove=(id:string)=>{onBegin();commit(removeVolumePoint(clip,id));setMenu(null);baseControl.current?.focus();};
 const activePoint=drag.current?.id?c.audio?.points.find(p=>p.id===drag.current!.id):undefined;
 const text=activePoint?`${(c.start+activePoint.time-c.sourceIn).toFixed(2)} s · ${Math.round(audioGain(c,activePoint.time)*100)}% (punkt ${Math.round(activePoint.gain*100)}%)`:drag.current?.kind==='in'||drag.current?.kind==='out'?`Fade ${drag.current.kind==='in'?'in':'out'}: ${visibleFade(c,drag.current.kind).toFixed(2)} s`:`Głośność ${Math.round((c.volume??1)*100)}%`;
 return <div ref={root} data-audio-automation="true" className={`audio-automation ${draft?'adjusting':''}`} role="group" aria-label={`Automatyka audio: ${name}`}
  onPointerMove={move} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>{if(drag.current)finish(e,true);}}
  onKeyDown={e=>{if(e.key==='Escape'&&(drag.current||menu)){e.preventDefault();e.stopPropagation();drag.current=null;setDraft(null);setMenu(null);return;}if(e.target!==baseControl.current||disabled)return;let value=c.volume??1;const step=e.shiftKey?.1:.01;if(e.key==='ArrowUp'||e.key==='ArrowRight')value=clamp(value+step);else if(e.key==='ArrowDown'||e.key==='ArrowLeft')value=clamp(value-step);else if(e.key==='Home')value=0;else if(e.key==='End')value=1;else return;e.preventDefault();e.stopPropagation();onBegin();commit({...clip,volume:Math.round(value*100)/100});}}>
  <div ref={baseControl} className="audio-base-control" role="slider" aria-label={`Głośność: ${name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((c.volume??1)*100)} aria-valuetext={`${Math.round((c.volume??1)*100)}% bazowej głośności; Alt+klik dodaje punkt`} aria-disabled={disabled} aria-orientation="vertical" tabIndex={disabled?-1:0}/>
  <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="audio-envelope-svg" aria-hidden="true">
   <path d={`${line} L${width},${height} L0,${height} Z`} className="audio-envelope-fill"/>
   <path d={line} className="audio-envelope-curve"/>
   <path d={line} className="audio-envelope-hit" onPointerDown={e=>begin(e,'volume')}><title>Głośność klipu · przeciągnij góra–dół · Alt+klik: punkt automatyki</title></path>
  </svg>
  {points.map((p,i)=><button key={p.id} type="button" role="slider" aria-label={`Punkt głośności ${i+1}: ${name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.gain*100)} aria-valuetext={`${(p.time-c.sourceIn).toFixed(2)} s w klipie, punkt ${Math.round(p.gain*100)}%, wynik ${Math.round(audioGain(c,p.time)*100)}%`} disabled={disabled} className="audio-volume-point" data-point-id={p.id} style={{left:clamp(x(p.time),5,width-5),top:y(audioGain(c,p.time))}} title={`${(p.time-c.sourceIn).toFixed(3)} s w klipie · ${Math.round(p.gain*100)}% · wynik ${Math.round(audioGain(c,p.time)*100)}% · ←→ czas, ↑↓ poziom, Delete usuwa`}
   onPointerDown={e=>begin(e,'point',p.id)} onContextMenu={e=>{e.preventDefault();e.stopPropagation();if(!disabled)setMenu({id:p.id,x:e.clientX,y:e.clientY});}}
   onKeyDown={e=>{if(disabled)return;if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopPropagation();remove(p.id);return;}let t=p.time,g=p.gain;const step=e.shiftKey?.1:.01;if(e.key==='ArrowLeft')t-=e.shiftKey?.1:1/30;else if(e.key==='ArrowRight')t+=e.shiftKey?.1:1/30;else if(e.key==='ArrowUp')g+=step;else if(e.key==='ArrowDown')g-=step;else return;e.preventDefault();e.stopPropagation();onBegin();commit(editVolumePoint(clip,p.id,t,g));}}/>)}
  {(['in','out'] as const).map(edge=><button key={edge} type="button" role="slider" aria-label={`Fade ${edge}: ${name}`} aria-valuemin={0} aria-valuemax={Number((c.sourceOut-c.sourceIn).toFixed(3))} aria-valuenow={Number(visibleFade(c,edge).toFixed(3))} aria-valuetext={`${visibleFade(c,edge).toFixed(2)} s`} disabled={disabled} className={`audio-fade-handle fade-${edge}`} style={{left:clamp((edge==='in'?visibleFade(c,edge):c.sourceOut-c.sourceIn-visibleFade(c,edge))*zoom,8,width-8)}} title={`Fade ${edge}: ${visibleFade(c,edge).toFixed(2)} s · przeciągnij · ←→ 1 klatka, Shift 0,1 s · Home zeruje`}
   onPointerDown={e=>begin(e,edge)} onKeyDown={e=>{if(disabled)return;let d=visibleFade(c,edge);if(e.key==='ArrowLeft')d+=(edge==='in'?-1:1)*(e.shiftKey?.1:1/30);else if(e.key==='ArrowRight')d+=(edge==='in'?1:-1)*(e.shiftKey?.1:1/30);else if(e.key==='Home'||e.key==='Delete')d=0;else return;e.preventDefault();e.stopPropagation();onBegin();commit(setFade(clip,edge,d));}}/>)}
  {draft&&<span className="audio-gesture-value" role="status">{text}</span>}
  {menu&&createPortal(<div className="audio-point-menu" role="menu" style={{left:Math.min(menu.x,window.innerWidth-160),top:Math.min(menu.y,window.innerHeight-50)}} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setMenu(null);baseControl.current?.focus();}}}><button autoFocus role="menuitem" onClick={()=>remove(menu.id)}>Usuń punkt</button></div>,document.body)}
 </div>;
}
