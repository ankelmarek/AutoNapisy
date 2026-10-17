import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {invoke} from '@tauri-apps/api/core';
import type {Project} from './model';
import {projectClips,type Clip} from './editing';
import {transformOf,changeTransform,frameRect,type Transform} from './framing';
import {videoHidden} from './trackControls';
type Frame={id:string;png:string;sourceAspect:number};
type Frames={width:number;height:number;layers:Frame[]};
type Props={project:Project;time:number;playing:boolean;locked:boolean;selectedId:string;onSelect:(id:string)=>void;onPause:()=>void;onChange:(p:Project)=>void;onAspects:(value:Record<string,number>)=>void};
export default function FrameEditor(p:Props){
 const [frames,setFrames]=useState<Frames|null>(null),[hint,setHint]=useState(''),[draft,setDraft]=useState<{id:string;value:Transform}|null>(null);
 const root=useRef<HTMLDivElement>(null),current=useRef(p);current.current=p;
 const drag=useRef<{id:string;kind:'move'|'scale';x:number;y:number;base:Transform;next:Transform;w:number;h:number;distance:number}|null>(null);
 const clips=projectClips(p.project),key=JSON.stringify([Math.floor(p.time*30),p.project.canvas,p.project.media?.path,p.project.assets.map(a=>[a.id,a.path]),clips.map(({transform:_,volume:__,...c})=>c),p.project.tracks.V1?.hidden,p.project.tracks.V2?.hidden,p.project.transitions]);
 useEffect(()=>{setFrames(null);setHint('');if(p.playing||!clips.length)return;let alive=true;const timer=setTimeout(()=>{
  void invoke<Frames>('layer_frames',{json:JSON.stringify(current.current.project),time:current.current.time}).then(v=>{if(!alive)return;setFrames(v);current.current.onAspects(Object.fromEntries(v.layers.map(f=>[f.id,f.sourceAspect])));}).catch(e=>{if(alive)setHint(String(e));});
 },120);return()=>{alive=false;clearTimeout(timer);};},[key,p.playing]);
 const active=frames?.layers.map(f=>({frame:f,clip:clips.find(c=>c.id===f.id)})).filter((f):f is {frame:Frame;clip:Clip}=>!!f.clip&&!videoHidden(p.project,f.clip))??[];
 const selected=active.find(f=>f.clip.id===p.selectedId);
 const start=(e:PointerEvent,id:string,kind:'move'|'scale')=>{
  if(p.locked||p.playing)return;e.preventDefault();e.stopPropagation();const box=root.current?.getBoundingClientRect(),clip=clips.find(c=>c.id===id);if(!box||!clip)return;
  p.onPause();p.onSelect(id);e.currentTarget.setPointerCapture(e.pointerId);const base=transformOf(clip),cx=box.left+box.width*(.5+base.x),cy=box.top+box.height*(.5+base.y);
  drag.current={id,kind,x:e.clientX,y:e.clientY,base,next:base,w:box.width,h:box.height,distance:Math.max(10,Math.hypot(e.clientX-cx,e.clientY-cy))};setDraft({id,value:base});
 };
 const move=(e:PointerEvent)=>{const d=drag.current,box=root.current?.getBoundingClientRect();if(!d||!box)return;e.stopPropagation();
  d.next=d.kind==='move'?{...d.base,x:Math.max(-2,Math.min(2,d.base.x+(e.clientX-d.x)/d.w)),y:Math.max(-2,Math.min(2,d.base.y+(e.clientY-d.y)/d.h))}:{...d.base,scale:Math.max(.1,Math.min(4,d.base.scale*Math.hypot(e.clientX-(box.left+d.w*(.5+d.base.x)),e.clientY-(box.top+d.h*(.5+d.base.y)))/d.distance))};
  if(e.shiftKey&&d.kind==='move'){if(Math.abs(e.clientX-d.x)>Math.abs(e.clientY-d.y))d.next.y=d.base.y;else d.next.x=d.base.x;}
  if(Math.abs(d.next.x)<.015)d.next.x=0;if(Math.abs(d.next.y)<.015)d.next.y=0;setDraft({id:d.id,value:d.next});
 };
 const end=(e:PointerEvent)=>{e.stopPropagation();const d=drag.current;drag.current=null;setDraft(null);if(d&&JSON.stringify(d.base)!==JSON.stringify(d.next))p.onChange(changeTransform(current.current.project,d.id,d.next));};
 const cancel=()=>{drag.current=null;setDraft(null);};
 const rect=selected?frameRect(100,100,draft?.id===selected.clip.id?draft.value:transformOf(selected.clip)):null;
 return <div className="frame-editor" ref={root} aria-label="Warstwy podglądu" data-ready={!!frames&&!p.playing}>
  {!p.playing&&active.map(({frame,clip})=>{const t=draft?.id===clip.id?draft.value:transformOf(clip);return <img draggable={false} className="frame-layer" data-layer-id={clip.id} key={clip.id} alt="" src={`data:image/png;base64,${frame.png}`} style={{zIndex:1+(clip.track??0),transform:`translate(${t.x*100}%,${t.y*100}%) scale(${t.scale})`,pointerEvents:p.locked?'none':'auto'}} onPointerDown={e=>start(e,clip.id,'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}/>;})}
  {!p.playing&&selected&&rect&&<div className="frame-selection" style={{left:`${rect.left}%`,top:`${rect.top}%`,width:`${rect.width}%`,height:`${rect.height}%`}}>
   {(['nw','ne','sw','se'] as const).map(corner=><button key={corner} className={`frame-handle ${corner}`} disabled={p.locked} aria-label={`Skaluj film ${corner}`} onPointerDown={e=>start(e,selected.clip.id,'scale')} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}/>)}
  </div>}
  {draft&&<><i className="frame-guide vertical"/><i className="frame-guide horizontal"/><span className="frame-transform-value">{Math.round(draft.value.scale*100)}% · X {Math.round(draft.value.x*100)}% · Y {Math.round(draft.value.y*100)}%</span></>}
  {!p.playing&&hint&&<span className="frame-hint">{hint}</span>}
 </div>;
}
