import {useRef,useState,useMemo,useEffect,type PointerEvent} from 'react';
import type {Project} from './model';
import {clipAt,clipEnd,closeGaps,compositionSegments,editDuration,moveClip,projectClips,splitClip,trimClip,type Clip} from './editing';
const stamp=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toFixed(2).padStart(5,'0')}`;
type Props={project:Project;time:number;locked:boolean;onSeek:(t:number)=>void;onChange:(clips:Clip[])=>void;undo:()=>void;redo:()=>void;canUndo:boolean;canRedo:boolean};
export default function Timeline(p:Props){
 const clips=projectClips(p.project),duration=editDuration(p.project);
 const [tool,setTool]=useState<'select'|'razor'>('select'),[snap,setSnap]=useState(true),[zoom,setZoom]=useState(30),[selected,setSelected]=useState(''),[draft,setDraft]=useState<Clip[]|null>(null);
 const shown=draft??clips,chosen=shown.find(c=>c.id===selected);
 const canvas=useRef<HTMLDivElement>(null);
 const [scroll,setScroll]=useState(0);
 const visibleCaptions=useMemo(()=>compositionSegments({...p.project,clips:shown}).filter(s=>s.end*zoom>=scroll && s.start*zoom<=scroll+window.innerWidth),[p.project,shown,zoom,scroll]);
 const drag=useRef<{id:string;kind:'move'|'left'|'right';x:number;base:Clip[];value:Clip[];moved:boolean}|null>(null);
 const point=(e:PointerEvent)=>Math.max(0,(e.clientX-(canvas.current?.getBoundingClientRect().left??0))/zoom);
 const scrubbing=useRef(false);
 const commit=(next:Clip[])=>{p.onChange(next);setDraft(null);};
 const cut=(id:string,t:number)=>{const next=splitClip(clips,id,t);if(next!==clips)commit(next);};
 const remove=()=>{if(chosen){commit(clips.filter(c=>c.id!==selected));setSelected('');}};
 const start=(e:PointerEvent,id:string,kind:'move'|'left'|'right')=>{
  if(p.locked)return;e.stopPropagation();setSelected(id);
  if(tool==='razor'&&kind==='move'){cut(id,point(e));return;}
  e.currentTarget.setPointerCapture(e.pointerId);drag.current={id,kind,x:e.clientX,base:clips,value:clips,moved:false};
 };
 const move=(e:PointerEvent)=>{
  const d=drag.current;if(!d||p.locked)return;
  if(Math.abs(e.clientX-d.x)<3&&!d.moved)return;d.moved=true;
  const c=d.base.find(x=>x.id===d.id)!;let delta=(e.clientX-d.x)/zoom;
  if(d.kind==='move')d.value=moveClip(d.base,d.id,c.start+delta,snap?10/zoom:0);
  else {
   const end=d.kind==='left'?c.start:clipEnd(c);
   if(snap){const targets=[0,p.time,...d.base.filter(x=>x.id!==c.id).flatMap(x=>[x.start,clipEnd(x)])];const nearest=targets.sort((a,b)=>Math.abs(a-end-delta)-Math.abs(b-end-delta))[0];if(Math.abs(nearest-end-delta)<=10/zoom)delta=nearest-end;}
   d.value=trimClip(d.base,d.id,d.kind,delta,p.project.media?.duration??0);
  }
  setDraft(d.value);
 };
 const end=(e:PointerEvent)=>{const d=drag.current;if(!d)return;drag.current=null;if(d.moved)commit(d.value);else p.onSeek(point(e));};
 useEffect(()=>{if(drag.current && drag.current.base!==clips){drag.current=null;setDraft(null);}},[clips]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{
  if(p.locked||e.ctrlKey||e.metaKey||e.altKey||(e.target instanceof HTMLElement&&(e.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))))return;
  if(e.key.toLowerCase()==='c')setTool('razor');if(e.key.toLowerCase()==='v')setTool('select');
 };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[p.locked]);
 const width=Math.max(900,(Math.max(duration,...shown.map(clipEnd))+5)*zoom);
 const tick=[1,2,5,10,30,60,120,300,600,1800,3600].find(x=>x*zoom>=90)??3600;
 return <section className="edit-timeline" aria-label="Montaż filmu">
  <div className="timeline-toolbar">
   <b>MONTAŻ</b>
   <button disabled={p.locked} aria-pressed={tool==='select'} onClick={()=>setTool('select')}>↖ Zaznacz</button>
   <button disabled={p.locked} aria-pressed={tool==='razor'} onClick={()=>setTool('razor')}>╱ Żyletka</button>
   <button disabled={p.locked||!clipAt(clips,p.time)} onClick={()=>{const c=clipAt(clips,p.time);if(c)cut(c.id,p.time);}}>Przetnij tutaj</button>
   <button disabled={p.locked||!chosen} onClick={remove}>Usuń ujęcie</button>
   <button disabled={p.locked||!clips.length} onClick={()=>commit(closeGaps(clips))}>Dosuń wszystkie</button>
   <button disabled={p.locked} aria-pressed={snap} onClick={()=>setSnap(!snap)}>Magnes {snap?'wł.':'wył.'}</button>
   <button disabled={p.locked||!p.canUndo} onClick={p.undo} title="Ctrl+Z">↶ Cofnij</button>
   <button disabled={p.locked||!p.canRedo} onClick={p.redo} title="Ctrl+Shift+Z">↷ Ponów</button>
   <label className="timeline-zoom">Zoom <input aria-label="Powiększenie osi czasu" type="range" min={2} max={160} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>
  </div>
  <div className="timeline-scroll" onScroll={e=>setScroll(e.currentTarget.scrollLeft)}>
   <div ref={canvas} className={`edit-canvas ${tool}`} style={{width}} onPointerDown={e=>{if(!p.locked){scrubbing.current=true;e.currentTarget.setPointerCapture(e.pointerId);p.onSeek(point(e));}}} onPointerMove={e=>{if(scrubbing.current&&!p.locked)p.onSeek(point(e));}} onPointerUp={()=>{scrubbing.current=false;}} onPointerCancel={()=>{scrubbing.current=false;}}>
    <div className="edit-ruler">{Array.from({length:Math.ceil(window.innerWidth/zoom/tick)+3},(_,n)=>Math.max(0,Math.floor(scroll/zoom/tick)-1)+n).map(i=><span key={i} style={{left:i*tick*zoom}}>{stamp(i*tick)}</span>)}</div>
    <div className="edit-lane-label">WIDEO + AUDIO</div>
    {shown.map((c,i)=><div key={c.id} role="button" tabIndex={p.locked?-1:0} aria-label={`Ujęcie ${i+1}`} aria-pressed={c.id===selected} className={`edit-clip ${c.id===selected?'selected':''}`} style={{left:c.start*zoom,width:(c.sourceOut-c.sourceIn)*zoom}} onFocus={()=>setSelected(c.id)} onKeyDown={e=>{if(p.locked)return;if(e.key==='Delete'){e.preventDefault();commit(clips.filter(x=>x.id!==c.id));}if(e.key==='Enter')p.onSeek(c.start);}} onPointerDown={e=>start(e,c.id,'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{drag.current=null;setDraft(null);}} title={`${p.project.media?.name}\nŹródło ${stamp(c.sourceIn)} – ${stamp(c.sourceOut)}\nOś ${stamp(c.start)} – ${stamp(clipEnd(c))}`}>
     <div className="trim-handle left" role="separator" aria-label={`Lewy brzeg ujęcia ${i+1}`} onPointerDown={e=>start(e,c.id,'left')}/>
     <span>{i+1} · {p.project.media?.name}</span><small>{stamp(c.sourceIn)} → {stamp(c.sourceOut)}</small>
     <div className="trim-handle right" role="separator" aria-label={`Prawy brzeg ujęcia ${i+1}`} onPointerDown={e=>start(e,c.id,'right')}/>
    </div>)}
    {visibleCaptions.map(s=><div className="edit-caption-mark" key={s.id} style={{left:s.start*zoom,width:Math.max(2,(s.end-s.start)*zoom)}} title={s.text}/>)}
    <div className="edit-playhead" style={{left:p.time*zoom}}><span>▼</span></div>
   </div>
  </div>
  <div className="timeline-properties">
   {chosen?<><b>Zaznaczone ujęcie</b><label>Pozycja <input aria-label="Pozycja ujęcia" type="number" min={0} step={0.01} disabled={p.locked} value={Number(chosen.start.toFixed(3))} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))commit(moveClip(clips,chosen.id,n,snap?10/zoom:0));}}/></label><label>Wejście źródła <input aria-label="Wejście źródła" type="number" step={0.01} min={0} max={chosen.sourceOut-.05} disabled={p.locked} value={Number(chosen.sourceIn.toFixed(3))} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))commit(trimClip(clips,chosen.id,'left',n-chosen.sourceIn,p.project.media?.duration??0));}}/></label><label>Wyjście źródła <input aria-label="Wyjście źródła" type="number" step={0.01} min={chosen.sourceIn+.05} max={p.project.media?.duration??0} disabled={p.locked} value={Number(chosen.sourceOut.toFixed(3))} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))commit(trimClip(clips,chosen.id,'right',n-chosen.sourceOut,p.project.media?.duration??0));}}/></label></>:<span>Żyletka: kliknij klip · Krawędzie: przytnij / przywróć · Środek: przesuń · Magnes: przyciągnij do sąsiada</span>}
   <input className="timeline-seek" aria-label="Pozycja odtwarzania" type="range" min={0} max={duration||1} step={0.01} value={Math.min(p.time,duration)} disabled={!duration||p.locked} onChange={e=>p.onSeek(Number(e.target.value))}/><code>{stamp(p.time)} / {stamp(duration)}</code>
  </div>
 </section>;
}
