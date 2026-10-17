import {useRef,useState,useMemo,useEffect,type PointerEvent} from 'react';
import type {Project} from './model';
import Icon from './Icons';
import VolumeLine from './VolumeLine';
const VIDEO_LANE=40,AUDIO_LANE=56;
import {clipAt,clipEnd,closeGaps,compositionSegments,editDuration,moveClip,projectClips,splitClip,trimClip,clipMedia,changeTrack,type Clip} from './editing';
const stamp=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toFixed(2).padStart(5,'0')}`;
type Props={project:Project;time:number;locked:boolean;onSeek:(t:number)=>void;onChange:(clips:Clip[],mode?:'volume')=>void;onPreviewVolume:(id:string,gain:number)=>void;undo:()=>void;redo:()=>void;canUndo:boolean;canRedo:boolean};
export default function Timeline(p:Props){
 const clips=projectClips(p.project),duration=editDuration(p.project);
 const [tool,setTool]=useState<'select'|'razor'>('select'),[snap,setSnap]=useState(true),[zoom,setZoom]=useState(30),[selected,setSelected]=useState(''),[draft,setDraft]=useState<Clip[]|null>(null);
 const shown=draft??clips,chosen=shown.find(c=>c.id===selected);
 const canvas=useRef<HTMLDivElement>(null);
 const [scroll,setScroll]=useState(0),[viewport,setViewport]=useState(window.innerWidth);
 useEffect(()=>{const resize=()=>setViewport(window.innerWidth);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 const visibleCaptions=useMemo(()=>compositionSegments({...p.project,clips:shown}).filter(s=>s.end*zoom>=scroll && s.start*zoom<=scroll+viewport),[p.project,shown,zoom,scroll,viewport]);
 const drag=useRef<{id:string;kind:'move'|'left'|'right';x:number;y:number;audioDrag:boolean;base:Clip[];value:Clip[];moved:boolean}|null>(null);
 const point=(e:PointerEvent)=>Math.max(0,(e.clientX-(canvas.current?.getBoundingClientRect().left??0))/zoom);
 const scrubbing=useRef(false);
 const commit=(next:Clip[])=>{p.onChange(next);setDraft(null);};
 const cut=(id:string,t:number)=>{const next=splitClip(clips,id,t);if(next!==clips)commit(next);};
 const remove=()=>{if(chosen){commit(clips.filter(c=>c.id!==selected));setSelected('');}};
 const start=(e:PointerEvent,id:string,kind:'move'|'left'|'right',mirror=false)=>{
  if(p.locked)return;e.stopPropagation();setSelected(id);
  if(tool==='razor'&&kind==='move'){cut(id,point(e));return;}
  e.currentTarget.setPointerCapture(e.pointerId);drag.current={id,kind,x:e.clientX,y:e.clientY,audioDrag:mirror||clips.find(c=>c.id===id)?.kind==='audio',base:clips,value:clips,moved:false};
 };
 const move=(e:PointerEvent)=>{
  const d=drag.current;if(!d||p.locked)return;
  if(Math.abs(e.clientX-d.x)<3&&Math.abs(e.clientY-d.y)<10&&!d.moved)return;d.moved=true;
  const c=d.base.find(x=>x.id===d.id)!;let delta=(e.clientX-d.x)/zoom;
  if(d.kind==='move'){const track=Math.abs(e.clientY-d.y)>20?Math.max(0,Math.min(1,(c.track??0)+(d.audioDrag?1:-1)*Math.round((e.clientY-d.y)/(d.audioDrag?AUDIO_LANE:VIDEO_LANE)))) as 0|1:c.track??0;const movedTrack=d.base.map(x=>x.id===d.id?{...x,track}:x);d.value=moveClip(movedTrack,d.id,c.start+delta,snap?10/zoom:0);}
  else {
   const end=d.kind==='left'?c.start:clipEnd(c);
   if(snap){const targets=[0,p.time,...d.base.filter(x=>x.id!==c.id).flatMap(x=>[x.start,clipEnd(x)])];const nearest=targets.sort((a,b)=>Math.abs(a-end-delta)-Math.abs(b-end-delta))[0];if(Math.abs(nearest-end-delta)<=10/zoom)delta=nearest-end;}
   d.value=trimClip(d.base,d.id,d.kind,delta,clipMedia(p.project,c)?.duration??0);
  }
  setDraft(d.value);
 };
 const end=(e:PointerEvent)=>{const d=drag.current;if(!d)return;drag.current=null;if(d.moved)commit(d.value);else p.onSeek(point(e));};
 useEffect(()=>{if(drag.current && drag.current.base!==clips){drag.current=null;setDraft(null);}},[clips]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{
  if(p.locked||e.ctrlKey||e.metaKey||e.altKey||(e.target instanceof HTMLElement&&(e.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))))return;
  if(e.key.toLowerCase()==='c')setTool('razor');if(e.key.toLowerCase()==='v')setTool('select');
 };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[p.locked]);
 const width=Math.max(900,viewport-40,(Math.max(duration,...shown.map(clipEnd))+5)*zoom);
 const tick=[1,2,5,10,30,60,120,300,600,1800,3600].find(x=>x*zoom>=90)??3600;
 return <section className="edit-timeline" aria-label="Montaż filmu">
  <div className="timeline-toolbar">
   <b>MONTAŻ</b>
   <button disabled={p.locked} aria-pressed={tool==='select'} onClick={()=>setTool('select')} aria-label="Zaznacz" title="Zaznacz" className="icon-button"><Icon name="cursor"/></button>
   <button disabled={p.locked} aria-pressed={tool==='razor'} onClick={()=>setTool('razor')} aria-label="Żyletka" title="Żyletka" className="icon-button"><Icon name="razor"/></button>
   <button disabled={p.locked||!(chosen??clipAt(clips,p.time))} onClick={()=>{const c=chosen??clipAt(clips,p.time);if(c)cut(c.id,p.time);}} aria-label="Przetnij tutaj" title="Przetnij tutaj" className="icon-button"><Icon name="cut"/></button>
   <button disabled={p.locked||!chosen} onClick={remove} aria-label="Usuń ujęcie" title="Usuń ujęcie" className="icon-button"><Icon name="trash"/></button>
   <button disabled={p.locked||!clips.length} onClick={()=>commit(closeGaps(clips))} aria-label="Dosuń wszystkie" title="Dosuń wszystkie" className="icon-button"><Icon name="pack"/></button>
   {!clips.length && (p.project.media?.duration??0)>=.05 && <button disabled={p.locked} onClick={()=>commit([{id:crypto.randomUUID(),sourceIn:0,sourceOut:p.project.media!.duration!,start:0}])} aria-label="Przywróć cały film" title="Przywróć cały film" className="icon-button"><Icon name="restore"/></button>}
   <button disabled={p.locked} aria-pressed={snap} onClick={()=>setSnap(!snap)} aria-label="Magnes" title={`Magnes: ${snap?'włączony':'wyłączony'}`} className="icon-button"><Icon name="magnet"/></button>
   <button disabled={p.locked||!p.canUndo} onClick={p.undo} aria-label="Cofnij" title="Cofnij" className="icon-button"><Icon name="undo"/></button>
   <button disabled={p.locked||!p.canRedo} onClick={p.redo} aria-label="Ponów" title="Ponów" className="icon-button"><Icon name="redo"/></button>
   <label className="timeline-zoom"><Icon name="zoom" size={16}/><input aria-label="Powiększenie osi czasu" type="range" min={2} max={160} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>
  </div>
  <div className="timeline-scroll" onScroll={e=>setScroll(e.currentTarget.scrollLeft)}>
   <div ref={canvas} className={`edit-canvas ${tool}`} style={{width}} onPointerDown={e=>{if(!p.locked){scrubbing.current=true;e.currentTarget.setPointerCapture(e.pointerId);p.onSeek(point(e));}}} onPointerMove={e=>{if(scrubbing.current&&!p.locked)p.onSeek(point(e));}} onPointerUp={()=>{scrubbing.current=false;}} onPointerCancel={()=>{scrubbing.current=false;}}>
    <div className="edit-ruler">{Array.from({length:Math.ceil(viewport/zoom/tick)+3},(_,n)=>Math.max(0,Math.floor(scroll/zoom/tick)-1)+n).filter(i=>i*tick*zoom<=width).map(i=><span key={i} style={{left:i*tick*zoom}}>{stamp(i*tick)}</span>)}</div>
    {['V2 · obraz na wierzchu','V1 · obraz','A1 · dźwięk','A2 · dźwięk'].map((name,i)=><div key={name} className="multi-lane" style={{top:28+(i<2?i*VIDEO_LANE:2*VIDEO_LANE+(i-2)*AUDIO_LANE),height:i<2?VIDEO_LANE:AUDIO_LANE}}><span>{name}</span></div>)}
    {shown.flatMap(c=>c.kind==='audio'?[{c,mirror:false}]:[{c,mirror:false},{c,mirror:true}]).map(({c,mirror},i)=><div key={c.id+(mirror?'-sound':'')} role="button" tabIndex={p.locked?-1:0} aria-label={`${mirror?'Dźwięk połączony':c.kind==='audio'?'Audio':'Ujęcie'} ${i+1}`} aria-pressed={c.id===selected} className={`edit-clip ${mirror||c.kind==='audio'?'audio-clip':''} ${c.id===selected?'selected':''}`} style={{top:31+((mirror||c.kind==='audio')?2*VIDEO_LANE+(c.track??0)*AUDIO_LANE:(1-(c.track??0))*VIDEO_LANE)+(c.kind==='audio'?28:0),left:c.start*zoom,width:(c.sourceOut-c.sourceIn)*zoom}} onFocus={()=>setSelected(c.id)} onKeyDown={e=>{if(p.locked)return;if(e.key==='Delete'){e.preventDefault();commit(clips.filter(x=>x.id!==c.id));}if(e.key==='Enter')p.onSeek(c.start);}} onPointerDown={e=>start(e,c.id,'move',mirror)} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{drag.current=null;setDraft(null);}} title={`${clipMedia(p.project,c)?.name}\nŹródło ${stamp(c.sourceIn)} – ${stamp(c.sourceOut)}\nOś ${stamp(c.start)} – ${stamp(clipEnd(c))}`}>
     <div className="trim-handle left" role="separator" aria-label={`Lewy brzeg ujęcia ${i+1}`} onPointerDown={e=>start(e,c.id,'left',mirror)}/>
     <span>{mirror&&<Icon name="link" size={10}/>} {clipMedia(p.project,c)?.name}</span><small>{stamp(c.sourceIn)} → {stamp(c.sourceOut)}</small>
     {(mirror||c.kind==='audio')&&<VolumeLine value={c.volume??1} name={clipMedia(p.project,c)?.name??'audio'} disabled={p.locked}
       onPreview={gain=>p.onPreviewVolume(c.id,gain)} onCommit={gain=>p.onChange(clips.map(x=>x.id===c.id?{...x,volume:gain}:x),'volume')}/>}
     <div className="trim-handle right" role="separator" aria-label={`Prawy brzeg ujęcia ${i+1}`} onPointerDown={e=>start(e,c.id,'right',mirror)}/>
    </div>)}
    {visibleCaptions.map(s=><div className="edit-caption-mark" key={s.id} style={{left:s.start*zoom,width:Math.max(2,(s.end-s.start)*zoom)}} title={s.text}/>)}
    <div className="edit-playhead" style={{left:p.time*zoom}}><span>▼</span></div>
   </div>
  </div>
  <div className="timeline-properties">
   {chosen?<><b>{chosen.kind==='audio'?'Niezależne audio':'Obraz + połączony dźwięk'}</b><label>Ścieżka <select aria-label="Ścieżka klipu" value={chosen.track??0} disabled={p.locked} onChange={e=>commit(changeTrack(clips,chosen.id,Number(e.target.value) as 0|1))}><option value={0}>{chosen.kind==='audio'?'A1':'V1 + A1'}</option><option value={1}>{chosen.kind==='audio'?'A2':'V2 + A2'}</option></select></label><label>Głośność <input aria-label="Głośność klipu" type="range" min={0} max={1} step={.01} value={chosen.volume??1} disabled={p.locked} onChange={e=>{const gain=Number(e.target.value);p.onPreviewVolume(chosen.id,gain);p.onChange(clips.map(c=>c.id===chosen.id?{...c,volume:gain}:c),'volume');}}/>{Math.round((chosen.volume??1)*100)}%</label><label>Pozycja <input aria-label="Pozycja ujęcia" type="number" min={0} step={0.01} disabled={p.locked} value={Number(chosen.start.toFixed(3))} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))commit(moveClip(clips,chosen.id,n,snap?10/zoom:0));}}/></label><label>Wejście źródła <input aria-label="Wejście źródła" type="number" step={0.01} min={0} max={chosen.sourceOut-.05} disabled={p.locked} value={Number(chosen.sourceIn.toFixed(3))} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))commit(trimClip(clips,chosen.id,'left',n-chosen.sourceIn,clipMedia(p.project,chosen)?.duration??0));}}/></label><label>Wyjście źródła <input aria-label="Wyjście źródła" type="number" step={0.01} min={chosen.sourceIn+.05} max={clipMedia(p.project,chosen)?.duration??0} disabled={p.locked} value={Number(chosen.sourceOut.toFixed(3))} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))commit(trimClip(clips,chosen.id,'right',n-chosen.sourceOut,clipMedia(p.project,chosen)?.duration??0));}}/></label></>:<span>V2 przykrywa V1 · Dźwięki sumują się · 🔗 audio filmu podąża za obrazem · Przeciągnij pionowo, aby zmienić ścieżkę</span>}
   <input className="timeline-seek" aria-label="Pozycja odtwarzania" type="range" min={0} max={duration||1} step={0.01} value={Math.min(p.time,duration)} disabled={!duration||p.locked} onChange={e=>p.onSeek(Number(e.target.value))}/><code>{stamp(p.time)} / {stamp(duration)}</code>
  </div>
 </section>;
}
