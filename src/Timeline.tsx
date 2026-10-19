import {useRef,useState,useMemo,useEffect,type PointerEvent} from 'react';
import {moveGroup} from './groupEditing';
import {defaultCutRequest,joinAfter,frameTime,type SmartCutRequest} from './smartCut';
import TrackResize from './TrackResize';
import {readTimelineView,writeTimelineView,fitTimelineZoom,wheelTimelineZoom} from './timelineView';
import {transitionDropTarget} from './transitionDrop';
import {decodeSourceDrop,SOURCE_RANGE_TYPE,type SourceRange} from './sourceSelection';
import type {Project} from './model';
import Icon from './Icons';
import {planEdit,rippleTrack,trackParticipates,rippleReason,type EditOperation,type RipplePlan} from './ripple';
import {detachAudio,detachedLabel,syncOffset,realignAudio} from './detachedAudio';
import AudioAutomation from './AudioAutomation';
import {NumberEdit} from './AudioProperties';
import {resizeCaption,editCaption,moveCaption} from './captionEditing';
import type {EditedSegment} from './editing';
import {timelineClips} from './effects';
import {transitionKinds,transitionLabels} from './transitionCatalog';
import type {EffectChoice} from './EffectsLibrary';
import AudioWaveform from './AudioWaveform';
import {toggleTrack,videoHidden,clipLocked,auditionMuted,type TrackId} from './trackControls';
import {tracksOf,trackId,routedAudio,MAX_TRACKS,type TrackKind} from './trackModel';
import {audioBusText,audioRouteText,busVideoTracks} from './audioLayout';
import {addTrack,removeTrack,reorderTrack,timelineLayout,laneAt,clipTop,clipLane,clipHeight} from './tracks';
import {clipAt,clipEnd,compositionSegments,editDuration,moveClip,projectClips,splitClip,trimClip,clipMedia,changeTrack,type Clip} from './editing';
const stamp=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toFixed(2).padStart(5,'0')}`;
type Props={selectedIds:string[];onSelectionChange:(ids:string[])=>void;onSmartCut:(request:SmartCutRequest)=>void;solo:ReadonlySet<string>;onSolo:(id:string)=>void;onClearSolo:()=>void;project:Project;time:number;locked:boolean;onSeek:(t:number)=>void;onError:(e:string)=>void;onChange:(clips:Clip[],mode?:'volume')=>void;onPreviewVolume:(id:string,gain:number)=>void;onBeginAudio:()=>void;undo:()=>void;redo:()=>void;canUndo:boolean;canRedo:boolean;onSelect:(id:string)=>void;onCaptionSelect:(id:string)=>void;onCaptionMark?:(id:string)=>void;onCaptionChange:(p:Project)=>void;effectChoice:EffectChoice;onTransition:(from:string,to:string,choice:EffectChoice)=>void;onTransitionSelect:(id:string)=>void;onMediaDrop:(id:string,at:number,track:number,range?:SourceRange,kind?:TrackKind)=>void};
export default function Timeline(p:Props){
 const clips=projectClips(p.project),duration=editDuration(p.project);
 const [tool,setTool]=useState<'select'|'razor'|'smartcut'>('select'),[snap,setSnap]=useState(true),[zoom,setZoom]=useState(30),[selected,setSelected]=useState(''),[draft,setDraft]=useState<Clip[]|null>(null);
 const [preview,setPreview]=useState<RipplePlan|null>(null),[trackMenu,setTrackMenu]=useState<{id:TrackId;x:number;y:number}|null>(null),[clipMenu,setClipMenu]=useState<{id:string;x:number;y:number}|null>(null);
 const [view,setView]=useState(readTimelineView),[heightDraft,setHeightDraft]=useState<{id:string;value:number}|null>(null),[trackDrop,setTrackDrop]=useState<{id:string;after:boolean}|null>(null);
 const compact=useMemo(()=>new Set(view.compact),[view.compact]);
 const setHeight=(id:string,value:number)=>setView(old=>({...old,heights:{...old.heights,[id]:value}}));
 useEffect(()=>writeTimelineView(view),[view]);
 useEffect(()=>setHeightDraft(null),[p.project]);
 useEffect(()=>{if(selected&&!p.selectedIds.includes(selected))setSelected(p.selectedIds.at(-1)??'');},[p.selectedIds]);
 const shown=draft??clips,lanes=timelineLayout(p.project,clips,compact,new Set(),heightDraft?{...view.heights,[heightDraft.id]:heightDraft.value}:view.heights),canvasHeight=Math.max(256,...lanes.map(t=>t.top+t.height)),chosen=shown.find(c=>c.id===selected),chosenLocked=!!chosen&&clipLocked(p.project,chosen);
 const change=(next:Project)=>{try{if(JSON.stringify(next)!==JSON.stringify(p.project))p.onCaptionChange(next);}catch(e){p.onError(String(e));}};
 const closePreview=()=>setPreview(null);
 const request=(op:EditOperation)=>{try{const plan=planEdit(p.project,op);setDraft(null);if(plan.active&&plan.conflicts.length){p.onBeginAudio();setPreview(plan);}else {closePreview();change(plan.active?plan.next:plan.plain);}}catch(e){p.onError(String(e));}};
 useEffect(()=>{if(preview&&preview.base!==p.project)closePreview();},[p.project]);
 useEffect(()=>{if(!clipMenu&&!trackMenu)return;const close=()=>{setClipMenu(null);setTrackMenu(null);};window.addEventListener('pointerdown',close);return()=>window.removeEventListener('pointerdown',close);},[clipMenu,trackMenu]);
 const canvas=useRef<HTMLDivElement>(null),scroller=useRef<HTMLDivElement>(null);
 const pointerSelecting=useRef(false);
 const pan=useRef<{x:number;left:number}|null>(null);
 const copied=useRef<Clip|null>(null);
 const captionDrag=useRef<{segment:EditedSegment;edge:'left'|'right'|'move';x:number;next:Project}|null>(null);
 const [captionDraft,setCaptionDraft]=useState<Project|null>(null),[captionSelected,setCaptionSelected]=useState(''),[hoverJoin,setHoverJoin]=useState('');
 const [scroll,setScroll]=useState(0),[viewport,setViewport]=useState(window.innerWidth);
 useEffect(()=>{const el=scroller.current;if(!el)return;const observer=new ResizeObserver(()=>setViewport(el.clientWidth));setViewport(el.clientWidth);observer.observe(el);return()=>observer.disconnect();},[]);
 const visibleCaptions=useMemo(()=>compositionSegments(captionDraft??{...p.project,clips:shown}).filter(s=>s.end*zoom>=scroll && s.start*zoom<=scroll+viewport),[p.project,shown,zoom,scroll,viewport,captionDraft]);
 const drag=useRef<{id:string;kind:'move'|'left'|'right';x:number;y:number;base:Clip[];value:Clip[];moved:boolean;ids:string[];error?:string;operation?:EditOperation}|null>(null);
 const point=(e:PointerEvent)=>Math.max(0,(e.clientX-(canvas.current?.getBoundingClientRect().left??0))/zoom);
 const cutSelection=useRef<{id:string;from:number;to:number}|null>(null);
 const [cutRange,setCutRange]=useState<{id:string;from:number;to:number}|null>(null);
 useEffect(()=>{cutSelection.current=null;setCutRange(null);captionDrag.current=null;setCaptionDraft(null);},[p.project,p.locked]);
 const scrubbing=useRef(false);
 const marquee=useRef<{x:number;y:number;base:string[];moved:boolean}|null>(null),[box,setBox]=useState<{left:number;top:number;width:number;height:number}|null>(null);
 useEffect(()=>{const el=scroller.current;if(!el)return;const wheel=(e:WheelEvent)=>{if(!e.ctrlKey)return;e.preventDefault();const pointer=Math.max(0,e.clientX-el.getBoundingClientRect().left),d=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?el.clientWidth:1),next=wheelTimelineZoom(zoom,d,duration,el.clientWidth,el.scrollLeft,pointer);setZoom(next.zoom);requestAnimationFrame(()=>{el.scrollLeft=next.left;setScroll(el.scrollLeft);});};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[zoom,duration]);
 const select=(ids:string[])=>{p.onSelectionChange(ids);if(!ids.includes(selected))setSelected(ids.at(-1)??'');};
 const deleteSelected=()=>{try{let next=p.project;for(const id of [...p.selectedIds].sort((a,b)=>(clips.find(c=>c.id===b)?.start??0)-(clips.find(c=>c.id===a)?.start??0))){if(!projectClips(next).some(c=>c.id===id))continue;const plan=planEdit(next,{kind:'delete',id});if(plan.conflicts.length)throw Error(plan.conflicts[0]);next=plan.active?plan.next:plan.plain;}change(next);select([]);}catch(e){p.onError(String(e));}};

 const commit=(next:Clip[])=>{p.onChange(next);setDraft(null);};
 const cut=(id:string,t:number)=>{const c=clips.find(c=>c.id===id);if(!c||clipLocked(p.project,c))return;const next=splitClip(clips,id,t);if(next!==clips)commit(next);};
 const remove=()=>{if(captionSelected){if(p.project.tracks.T?.locked)return;const s=compositionSegments(p.project).find(s=>s.id===captionSelected);if(s)p.onCaptionChange(editCaption(p.project,s,{hidden:true}));setCaptionSelected('');return;}if(p.selectedIds.length>1){deleteSelected();return;}if(chosen&&!chosenLocked){request({kind:'delete',id:selected});select([]);setSelected('');}};
 const start=(e:PointerEvent,id:string,kind:'move'|'left'|'right')=>{
  if(p.locked)return;e.stopPropagation();if(e.button!==0)return;e.preventDefault();pointerSelecting.current=true;(e.currentTarget as HTMLElement).closest<HTMLElement>('.edit-clip')?.focus({preventScroll:true});pointerSelecting.current=false;
  const additive=e.ctrlKey||e.metaKey||e.shiftKey,ids=kind==='move'&&tool==='select'?(additive?(p.selectedIds.includes(id)?p.selectedIds.filter(x=>x!==id):[...p.selectedIds,id]):p.selectedIds.includes(id)?p.selectedIds:[id]):[id];
  select(ids);setCaptionSelected('');if(!ids.includes(id))return;setSelected(id);p.onSelect(id);
  if(clipLocked(p.project,clips.find(c=>c.id===id)!))return;
  p.onBeginAudio();
  if(tool==='smartcut'&&kind==='move'){const c=clips.find(c=>c.id===id)!;if(c.kind==='audio'){p.onError('Zaznacz zakres na filmie.');return;}const at=frameTime(Math.max(c.start,Math.min(clipEnd(c),point(e))));e.currentTarget.setPointerCapture(e.pointerId);cutSelection.current={id,from:at,to:at};setCutRange(cutSelection.current);return;}
  if(tool==='razor'&&kind==='move'){cut(id,point(e));return;}
  e.currentTarget.setPointerCapture(e.pointerId);drag.current={id,kind,x:e.clientX,y:e.clientY,base:clips,value:clips,moved:false,ids};
 };
 const move=(e:PointerEvent)=>{
  if(cutSelection.current&&!p.locked){const d=cutSelection.current,c=clips.find(c=>c.id===d.id)!;d.to=frameTime(Math.max(c.start,Math.min(clipEnd(c),point(e))));setCutRange({...d});return;}
  const d=drag.current;if(!d||p.locked)return;
  if(Math.abs(e.clientX-d.x)<3&&Math.abs(e.clientY-d.y)<10&&!d.moved)return;d.moved=true;
  const c=d.base.find(x=>x.id===d.id)!;let delta=(e.clientX-d.x)/zoom;
  if(d.kind==='move'&&d.ids.length>1){
   try{d.value=moveGroup({...p.project,clips:d.base},d.ids,delta,snap?10/zoom:0);d.error=undefined;}catch(err){d.error=String(err);d.value=d.base;}
  }else if(d.kind==='move'){
   let next=c;const target=laneAt(lanes,e.clientY-(canvas.current?.getBoundingClientRect().top??0));
   if(Math.abs(e.clientY-d.y)>20&&target){
    if(c.kind==='audio'&&target.kind==='audio')next={...c,track:target.index};
    else if(c.kind!=='audio'&&target.kind==='video')next={...c,track:target.index,audioRoute:c.audioRoute??(routedAudio(c)===null?'embedded':trackId('audio',routedAudio(c)!))};
   }
   const movedTrack=d.base.map(x=>x.id===d.id?next:x);d.value=moveClip(movedTrack,d.id,c.start+delta,snap?10/zoom:0);
  }
  else {
   const end=d.kind==='left'?c.start:clipEnd(c);
   if(snap){const targets=[0,p.time,...d.base.filter(x=>x.id!==c.id).flatMap(x=>[x.start,clipEnd(x)])];const nearest=targets.sort((a,b)=>Math.abs(a-end-delta)-Math.abs(b-end-delta))[0];if(Math.abs(nearest-end-delta)<=10/zoom)delta=nearest-end;}
   d.operation={kind:'trim',id:d.id,edge:d.kind,delta};
   try{const plan=planEdit(p.project,d.operation);d.value=plan.conflicts.length?projectClips(plan.plain):projectClips(plan.next);}catch{d.value=d.base;}
  }
  // Moving a keyed node in the DOM releases pointer capture in WebView2. Pure edit
  // helpers may sort their result; keep the painted order stable until pointer-up.
  const order=new Map(d.base.map((c,i)=>[c.id,i]));
  setDraft([...d.value].sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity)));
 };
 const end=(e:PointerEvent)=>{if(cutSelection.current){const d=cutSelection.current;cutSelection.current=null;const from=Math.min(d.from,d.to),to=Math.max(d.from,d.to);if(to-from>=2/30-1e-6)p.onSmartCut({kind:'range',id:d.id,from,to});return;}const d=drag.current;if(!d)return;drag.current=null;if(d.moved){if(d.error){setDraft(null);p.onError(d.error);return;}if(d.operation)request(d.operation);else commit(d.value);}else p.onSeek(point(e));};
 useEffect(()=>{if(drag.current && drag.current.base!==clips){drag.current=null;setDraft(null);}},[clips]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&(captionDrag.current||marquee.current)){e.preventDefault();captionDrag.current=null;setCaptionDraft(null);marquee.current=null;setBox(null);return;}if(e.key==='Escape'&&cutSelection.current){cutSelection.current=null;setCutRange(null);return;}if(e.key==='Escape'&&(preview||trackMenu)){e.preventDefault();closePreview();setTrackMenu(null);return;}if(e.key==='Escape'&&drag.current){e.preventDefault();drag.current=null;setDraft(null);return;}if(document.activeElement?.closest('.source-viewer'))return;
  if(p.locked||document.querySelector('dialog[open]')||preview||clipMenu||trackMenu||e.altKey||(e.target instanceof HTMLElement&&(e.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))))return;
  const modifier=e.ctrlKey||e.metaKey;
  if(modifier&&e.key.toLowerCase()==='a'){e.preventDefault();select(clips.filter(c=>!clipLocked(p.project,c)).map(c=>c.id));setCaptionSelected('');return;}
  if(modifier&&e.key.toLowerCase()==='c'){if(chosen){e.preventDefault();copied.current={...chosen,adjustments:chosen.adjustments?{...chosen.adjustments}:undefined};}return;}
  if(modifier&&e.key.toLowerCase()==='v'){if(copied.current){e.preventDefault();if(clips.length>=100)return;const copy={...copied.current,syncGroup:undefined,id:crypto.randomUUID(),start:Math.max(p.time,duration)};commit(moveClip([...clips,copy],copy.id,p.time,snap?10/zoom:0));}return;}
  if(modifier&&e.key.toLowerCase()==='x'){if(chosen&&!chosenLocked){e.preventDefault();copied.current={...chosen};request({kind:'delete',id:chosen.id});select(p.selectedIds.filter(id=>id!==chosen.id));}return;}
  if(modifier&&e.key.toLowerCase()==='d'){if(chosen&&clips.length<100){e.preventDefault();const copy={...chosen,syncGroup:undefined,id:crypto.randomUUID(),start:duration};commit(moveClip([...clips,copy],copy.id,clipEnd(chosen),snap?10/zoom:0));}return;}
  if(modifier)return;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(captionSelected){if(p.project.tracks.T?.locked)return;const s=compositionSegments(p.project).find(s=>s.id===captionSelected);if(s)p.onCaptionChange(editCaption(p.project,s,{hidden:true}));setCaptionSelected('');}else remove();return;}
  if(e.key.toLowerCase()==='c')setTool('razor');if(e.key.toLowerCase()==='v')setTool('select');
 };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[p.locked,p.project,p.time,selected,p.selectedIds,captionSelected,preview,clipMenu,trackMenu]);
 const [mediaDrop,setMediaDrop]=useState<{at:number;id:string}|null>(null);
 const width=Math.max(viewport,(Math.max(duration,...shown.map(clipEnd)))*zoom+32);
 const tick=[1,2,5,10,30,60,120,300,600,1800,3600].find(x=>x*zoom>=90)??3600;
 return <><section className="edit-timeline" aria-label="Montaż filmu">
  <div className="timeline-toolbar">
   <button disabled={p.locked} aria-pressed={tool==='select'} onClick={()=>setTool('select')} aria-label="Zaznacz" title="Zaznacz · Ctrl/Shift+klik dodaje klipy · przeciągnij pusty obszar, aby zaznaczyć grupę" className="icon-button"><Icon name="cursor"/></button>
   {p.selectedIds.length>1&&<span className="selection-count" role="status">Wybrano: {p.selectedIds.length}</span>}
   <button disabled={p.locked} aria-pressed={tool==='razor'} onClick={()=>setTool('razor')} aria-label="Żyletka" title="Żyletka" className="icon-button"><Icon name="razor"/></button>
   <button disabled={p.locked||!(chosen??clipAt(clips,p.time,p.project))} onClick={()=>{const c=chosen??clipAt(clips,p.time,p.project);if(c)cut(c.id,p.time);}} aria-label="Przetnij tutaj" title="Przetnij tutaj" className="icon-button"><Icon name="cut"/></button>
   <button className="smartcut-tool" disabled={p.locked} aria-label="Zaznacz zakres SmartCut" aria-pressed={tool==='smartcut'} title="SmartCut: przeciągnij zakres na filmie" onClick={()=>setTool(tool==='smartcut'?'select':'smartcut')}><Icon name="cut" size={15}/> SmartCut</button>
   <button disabled={p.locked||(!chosen&&!captionSelected)} onClick={remove} aria-label="Usuń zaznaczenie" title="Usuń zaznaczenie" className="icon-button"><Icon name="trash"/></button>
   <button disabled={p.locked} aria-pressed={p.project.rippleEnabled} aria-label="Tryb Ripple" title="Ripple: automatyczne dosuwanie po przycięciu lub usunięciu. Cofnij jednym Ctrl+Z." onClick={()=>change({...p.project,rippleEnabled:!p.project.rippleEnabled})} className="ripple-toggle"><Icon name="pack" size={16}/> Ripple {p.project.rippleEnabled?'wł.':'wył.'}</button>
   {!clips.length && (p.project.media?.duration??0)>=.05 && <button disabled={p.locked} onClick={()=>commit([{id:crypto.randomUUID(),sourceIn:0,sourceOut:p.project.media!.duration!,start:0}])} aria-label="Przywróć cały film" title="Przywróć cały film" className="icon-button"><Icon name="restore"/></button>}
   <button disabled={p.locked} aria-pressed={snap} onClick={()=>setSnap(!snap)} aria-label="Magnes" title={`Magnes: ${snap?'włączony':'wyłączony'}`} className="icon-button"><Icon name="magnet"/></button>
   <button disabled={p.locked||!p.canUndo} onClick={p.undo} aria-label="Cofnij" title="Cofnij" className="icon-button"><Icon name="undo"/></button>
   <button disabled={p.locked||!p.canRedo} onClick={p.redo} aria-label="Ponów" title="Ponów" className="icon-button"><Icon name="redo"/></button>
   {(['video','audio'] as const).map(kind=><button key={kind} disabled={p.locked||tracksOf(p.project,kind).length>=MAX_TRACKS} aria-label={`Dodaj ścieżkę ${kind==='video'?'wideo':'audio'}`} title={`Dodaj niezależną ścieżkę ${kind==='video'?'wideo':'audio'}`} onClick={()=>{try{change(addTrack(p.project,kind));}catch(e){p.onError(String(e));}}} className="add-track"><Icon name="add" size={13}/>{kind==='video'?'V':'A'}</button>)}
   {p.solo.size>0&&<button className="solo-status" onClick={p.onClearSolo} title="Solo dotyczy tylko odsłuchu. Eksport i pomiary używają pełnego miksu.">Solo · pełny miks</button>}

   {tool==='smartcut'&&<span className="smartcut-help">Przeciągnij zakres na filmie.{chosen&&chosen.kind!=='audio'&&<button disabled={p.locked||chosenLocked} onClick={()=>{try{p.onSmartCut(defaultCutRequest(p.project,chosen.id,p.time));}catch(e){p.onError(String(e));}}}>Ustaw granice…</button>}</span>}
   <label className="timeline-zoom"><Icon name="zoom" size={16}/><input aria-label="Powiększenie osi czasu" type="range" min={Math.min(2,fitTimelineZoom(duration,viewport))} max={160} step="any" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>
   <button className="fit-timeline" aria-label="Pokaż cały montaż" title="Pokaż cały montaż" onClick={()=>{setZoom(fitTimelineZoom(duration,viewport));if(scroller.current)scroller.current.scrollLeft=0;setScroll(0);}}><Icon name="search" size={14}/> Cały montaż</button>
  </div>
  <div className="timeline-body">
  <div className="track-heads" aria-label="Sterowanie ścieżkami" style={{height:canvasHeight}}>
   <div className="track-head-ruler"><Icon name="video" size={14}/></div>
   {lanes.map(({id:rawId,top,height,index,kind,rowCount,embedded})=>{const id=rawId as TrackId;
    const state=p.project.tracks[id],isVideo=id.startsWith('V'),r=rippleTrack(p.project,id);
    return <div key={id} data-track-id={id} className={`track-head ${trackDrop?.id===id?trackDrop.after?'drop-track-after':'drop-track-before':''}`} style={{top,height}}
     onDragOver={e=>{if(p.locked||id==='T'||!e.dataTransfer.types.includes('application/x-rolvixa-track'))return;e.preventDefault();e.dataTransfer.dropEffect='move';setTrackDrop({id,after:e.clientY>e.currentTarget.getBoundingClientRect().top+height/2});}}
     onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setTrackDrop(null);}}
     onDrop={e=>{if(p.locked||!e.dataTransfer.types.includes('application/x-rolvixa-track'))return;e.preventDefault();try{change(reorderTrack(p.project,e.dataTransfer.getData('application/x-rolvixa-track'),id,e.clientY>e.currentTarget.getBoundingClientRect().top+height/2));}catch(err){p.onError(String(err));}setTrackDrop(null);}}>
     {id==='T'?<b>{id}</b>:<button className="track-reorder" draggable={!p.locked&&!state?.locked} disabled={p.locked||state?.locked} aria-label={`Przenieś ścieżkę ${id}`} title={`Przeciągnij ${id} · Alt+strzałka góra/dół zmienia kolejność`} onDragStart={e=>{e.dataTransfer.setData('application/x-rolvixa-track',id);e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>setTrackDrop(null)} onKeyDown={e=>{if(!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const order=lanes.filter(t=>t.kind===kind),at=order.findIndex(t=>t.id===id),target=order[at+(e.key==='ArrowUp'?-1:1)];if(target)try{change(reorderTrack(p.project,id,target.id,e.key==='ArrowDown'));}catch(err){p.onError(String(err));}}}>{id}</button>}<div>
     <button disabled={p.locked} aria-label={`Blokada ${id}`} aria-pressed={!!state?.locked} title={`${state?.locked?'Odblokuj':'Zablokuj'} ${id}`} onClick={()=>change({...p.project,tracks:{...p.project.tracks,[id]:{...state,locked:!state?.locked}}})}><Icon name={state?.locked?'lock':'lockOpen'} size={12}/><span className="sr-only">Blokada</span></button>
     <button className="track-settings-button" disabled={p.locked} aria-label={`Ustawienia ścieżki ${id}`} aria-expanded={trackMenu?.id===id} title={`Ustawienia ścieżki ${id}: ${rippleReason(r)}`} data-ripple-enabled={trackParticipates(r)} onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();setTrackMenu(trackMenu?.id===id?null:{id,x:Math.min(rect.left,window.innerWidth-300),y:Math.max(8,Math.min(rect.bottom+4,window.innerHeight-210))});}}><Icon name="settings" size={12}/></button>
     {id!=='T'&&<button disabled={p.locked} aria-label={`Wycisz ${id}`} aria-pressed={!!state?.muted} title={isVideo?`Wycisz dźwięk filmów na ${id}`:`Wycisz ${audioBusText(clips,index)}`} onClick={()=>p.onCaptionChange(toggleTrack(p.project,id,'muted'))}><Icon name={state?.muted?'speakerOff':'speaker'} size={14}/></button>}
     {id!=='T'&&<button className="track-solo" disabled={p.locked} aria-label={`Solo ${id}`} aria-pressed={p.solo.has(id)} title={`Solo ${id}: tylko odsłuch, bez wpływu na eksport. A obejmuje także trasowany dźwięk filmów.`} onClick={()=>p.onSolo(id)}><Icon name="audio" size={12}/><span className="sr-only">Solo</span></button>}
     {(isVideo||id==='T')&&<button disabled={p.locked} aria-label={`Ukryj ${id}`} aria-pressed={!!state?.hidden} title={state?.hidden?`Pokaż ${id}`:`Ukryj ${id} w podglądzie i eksporcie`} onClick={()=>p.onCaptionChange(toggleTrack(p.project,id,'hidden'))}><Icon name={state?.hidden?'eyeOff':'eye'} size={14}/></button>}
     {id!=='T'&&<button className="track-collapse" disabled={p.locked} aria-label={`Zwiń ${id}`} aria-pressed={compact.has(id)} title={`Zwiń / rozwiń ${id}`} onClick={()=>setView(old=>({...old,compact:old.compact.includes(id)?old.compact.filter(x=>x!==id):[...old.compact,id]}))}><Icon name="chevronDown" size={11}/></button>}
     {kind==='audio'&&!compact.has(id)&&<button className="track-height" disabled={p.locked} aria-label={`Wysokość ${id}`} title={`Zmień wysokość ${id}`} onClick={()=>setHeight(id,height/rowCount>=100?56:112)}><Icon name="audio" size={11}/></button>}
     {id!=='T'&&index>=2&&<button className="track-remove" disabled={p.locked||state?.locked} aria-label={`Usuń ścieżkę ${id}`} title={`Usuń ścieżkę ${id}`} onClick={()=>{try{const contains=clips.some(c=>(c.kind==='audio'?'audio':'video')===kind&&(c.track??0)===index);if(contains&&!window.confirm(`Usunąć ścieżkę ${id} wraz z jej klipami? Możesz cofnąć tę operację.`))return;change(removeTrack(p.project,id,contains));}catch(e){p.onError(String(e));}}}><Icon name="x" size={11}/></button>}
    </div>{kind==='audio'&&<small className="track-audio-info" title={audioBusText(clips,index)}>{rowCount>1?`Rzędy: ${rowCount} · wspólny mute` : busVideoTracks(clips,index).length?`+ audio ${busVideoTracks(clips,index).join(', ')}`:''}</small>}{id!=='T'&&<TrackResize id={id} kind={kind as TrackKind} value={height/rowCount} rows={rowCount} embedded={embedded} disabled={p.locked||compact.has(id)} onDraft={value=>setHeightDraft(value===null?null:{id,value})} onCommit={value=>setHeight(id,value)}/>}</div>;
   })}
  </div>
  <div className="timeline-scroll" ref={scroller}
   onPointerDownCapture={e=>{if((!e.altKey&&e.button!==1)||(e.button===0&&(e.target as Element).closest('[data-audio-automation]')))return;e.preventDefault();e.stopPropagation();pan.current={x:e.clientX,left:e.currentTarget.scrollLeft};e.currentTarget.setPointerCapture(e.pointerId);}}
   onPointerMoveCapture={e=>{if(!pan.current)return;e.preventDefault();e.stopPropagation();e.currentTarget.scrollLeft=pan.current.left-(e.clientX-pan.current.x);}}
   onPointerUpCapture={e=>{if(pan.current){e.stopPropagation();pan.current=null;}}} onPointerCancelCapture={()=>pan.current=null} onScroll={e=>setScroll(e.currentTarget.scrollLeft)}>
   <div ref={canvas} className={`edit-canvas ${tool}`} style={{width,height:canvasHeight}} onDragEnd={()=>setHoverJoin('')} onDragOverCapture={e=>{if(p.locked||!e.dataTransfer.types.includes('application/x-rolvixa-transition'))return;const rect=e.currentTarget.getBoundingClientRect(),target=transitionDropTarget(shown,lanes,e.clientX-rect.left,e.clientY-rect.top,zoom,p.project.transitions);e.stopPropagation();setHoverJoin(target?.from??'');if(target){e.preventDefault();e.dataTransfer.dropEffect='copy';}}} onDropCapture={e=>{if(p.locked||!e.dataTransfer.types.includes('application/x-rolvixa-transition'))return;e.preventDefault();e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect(),target=transitionDropTarget(shown,lanes,e.clientX-rect.left,e.clientY-rect.top,zoom,p.project.transitions);setHoverJoin('');if(!target){p.onError('Upuść przejście przy styku sąsiadujących filmów na tym samym torze.');return;}try{const choice=JSON.parse(e.dataTransfer.getData('application/x-rolvixa-transition'));if(transitionKinds.includes(choice.kind)&&Number.isFinite(choice.duration))p.onTransition(target.from,target.to,choice);else p.onError('Nieprawidłowe dane przejścia.');}catch(err){p.onError(String(err));}}} onDragOver={e=>{if(p.locked||!e.dataTransfer.types.includes('application/x-rolvixa-media'))return;const rect=e.currentTarget.getBoundingClientRect(),target=laneAt(lanes,e.clientY-rect.top);if(!target){setMediaDrop(null);return;}e.preventDefault();e.dataTransfer.dropEffect='copy';setMediaDrop({at:Math.max(0,(e.clientX-rect.left)/zoom),id:target.id});}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node)){setMediaDrop(null);setHoverJoin('');}}} onDrop={e=>{if(p.locked||!e.dataTransfer.types.includes('application/x-rolvixa-media'))return;e.preventDefault();const rect=e.currentTarget.getBoundingClientRect(),target=laneAt(lanes,e.clientY-rect.top);if(target)try{const raw=e.dataTransfer.getData(SOURCE_RANGE_TYPE),drop=raw?decodeSourceDrop(raw):{id:e.dataTransfer.getData('application/x-rolvixa-media'),range:undefined};p.onMediaDrop(drop.id,Math.max(0,(e.clientX-rect.left)/zoom),target.index,drop.range,target.kind as TrackKind);}catch{}setMediaDrop(null);}} onPointerDown={e=>{if(p.locked||e.button!==0)return;const rect=e.currentTarget.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;e.currentTarget.setPointerCapture(e.pointerId);if(y<24){scrubbing.current=true;p.onSeek(point(e));return;}marquee.current={x,y,base:e.ctrlKey||e.metaKey||e.shiftKey?p.selectedIds:[],moved:false};}}
    onPointerMove={e=>{if(scrubbing.current&&!p.locked)p.onSeek(point(e));const d=marquee.current;if(!d||p.locked)return;const rect=e.currentTarget.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;if(!d.moved&&Math.abs(x-d.x)+Math.abs(y-d.y)<5)return;d.moved=true;const b={left:Math.min(x,d.x),top:Math.min(y,d.y),width:Math.abs(x-d.x),height:Math.abs(y-d.y)};setBox(b);const hits=timelineClips(p.project,clips).filter(c=>!clipLocked(p.project,c)&&c.start*zoom<b.left+b.width&&clipEnd(c)*zoom>b.left&&clipTop(lanes,c)<b.top+b.height&&clipTop(lanes,c)+clipHeight(lanes,c)>b.top).map(c=>c.id);select([...new Set([...d.base,...hits])]);setCaptionSelected('');}}
    onPointerUp={e=>{scrubbing.current=false;const d=marquee.current;marquee.current=null;setBox(null);if(d&&!d.moved){select(d.base);setCaptionSelected('');p.onSeek(point(e));}}} onPointerCancel={()=>{scrubbing.current=false;marquee.current=null;setBox(null);}}>
    <div className="edit-ruler">{Array.from({length:Math.ceil(viewport/zoom/tick)+3},(_,n)=>Math.max(0,Math.floor(scroll/zoom/tick)-1)+n).filter(i=>i*tick*zoom<=width).map(i=><span key={i} style={{left:i*tick*zoom}}>{stamp(i*tick)}</span>)}</div>
    {lanes.filter(t=>t.kind!=='captions').map(t=><div key={t.id} data-lane-id={t.id} data-audio-rows={t.rowCount} className="multi-lane" style={{top:t.top,height:t.height}}/>)}
    {timelineClips(p.project,shown).map((c,i)=><div key={c.id} role="button" tabIndex={p.locked?-1:0} aria-label={`${c.kind==='audio'?'Audio':'Ujęcie'} ${i+1}`} aria-pressed={p.selectedIds.includes(c.id)} data-clip-id={c.id} data-kind={c.kind??'video'} data-detached={!!c.audioDetached} className={`edit-clip ${clipLane(lanes,c)?.collapsed?'compact-clip':''} ${clipLocked(p.project,c)?'clip-is-locked':''} ${c.kind==='audio'?'audio-clip':!c.audioDetached?'video-with-audio':''} ${p.selectedIds.includes(c.id)?'selected':''} ${c.kind==='audio'?(auditionMuted(p.project,c,p.solo)?'track-is-muted':''):(videoHidden(p.project,c)?'picture-is-hidden':'')}`} style={{top:clipTop(lanes,c),height:clipHeight(lanes,c),left:c.start*zoom,width:(c.sourceOut-c.sourceIn)*zoom}} onFocus={()=>{if(pointerSelecting.current)return;if(!p.selectedIds.includes(c.id))select([c.id]);setSelected(c.id);setCaptionSelected('');p.onSelect(c.id);}} onContextMenu={e=>{e.preventDefault();if(p.locked)return;if(!p.selectedIds.includes(c.id))select([c.id]);setSelected(c.id);p.onSelect(c.id);setClipMenu({id:c.id,x:Math.min(e.clientX,window.innerWidth-235),y:Math.max(8,Math.min(e.clientY,window.innerHeight-Math.min(window.innerHeight*.7,tracksOf(p.project,'audio').length*32+112)-8))});}} onKeyDown={e=>{if(p.locked)return;if(e.key==='Delete'){e.preventDefault();e.stopPropagation();remove();}if(e.key==='Enter')p.onSeek(c.start);}} onPointerDown={e=>start(e,c.id,'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{cutSelection.current=null;setCutRange(null);drag.current=null;setDraft(null);}} title={`${clipMedia(p.project,c)?.name}\nŹródło ${stamp(c.sourceIn)} – ${stamp(c.sourceOut)}\nOś ${stamp(c.start)} – ${stamp(clipEnd(c))}${c.kind!=='audio'?'\n'+audioRouteText(c):''}`}>
     <div className="trim-handle left" role="separator" aria-label={`Lewy brzeg ujęcia ${i+1}`} onPointerDown={e=>start(e,c.id,'left')}/>
     <div className="clip-picture"><span>{clipMedia(p.project,c)?.name}</span><small>{stamp(c.sourceIn)} → {stamp(c.sourceOut)}</small></div>
     {c.kind!=='audio'&&!c.audioDetached&&<span className="clip-route" title={audioRouteText(c)} aria-label={audioRouteText(c)}><Icon name="link" size={10}/>{routedAudio(c)===null?trackId('video',c.track??0):trackId('audio',routedAudio(c)!)}</span>}
     {(c.kind==='audio'||!c.audioDetached)&&<div className={`${c.kind==='audio'?'independent-audio':'linked-audio'} ${c.kind!=='audio'&&auditionMuted(p.project,c,p.solo)?'track-is-muted':''}`} role="group" aria-label={`${c.kind==='audio'?'Niezależne audio':'Dźwięk połączony'}: ${clipMedia(p.project,c)?.name}`} title={c.kind==='audio'?undefined:audioRouteText(c)}>
      <AudioWaveform path={clipMedia(p.project,c)?.path} duration={clipMedia(p.project,c)?.duration??0} sourceIn={c.sourceIn} sourceOut={c.sourceOut}/>
      <AudioAutomation clip={c} zoom={zoom} name={clipMedia(p.project,c)?.name??'audio'} disabled={p.locked||clipLocked(p.project,c)} onBegin={p.onBeginAudio} onCommit={next=>p.onChange(clips.map(x=>x.id===c.id?{...x,volume:next.volume,audio:next.audio}:x),'volume')}/>
     </div>}
     <div className="trim-handle right" role="separator" aria-label={`Prawy brzeg ujęcia ${i+1}`} onPointerDown={e=>start(e,c.id,'right')}/>
    </div>)}

    {cutRange&&clips.some(c=>c.id===cutRange.id)&&tool==='smartcut'&&<div className="smartcut-selection" style={{left:Math.min(cutRange.from,cutRange.to)*zoom,width:Math.abs(cutRange.to-cutRange.from)*zoom,top:clipTop(lanes,clips.find(c=>c.id===cutRange.id)!),height:clipHeight(lanes,clips.find(c=>c.id===cutRange.id)!)}}><span>SmartCut</span></div>}
    {visibleCaptions.map(s=><div className={`caption-timeline-clip ${captionSelected===s.id?'selected':''} ${p.project.tracks.T?.hidden?'track-is-hidden':''}`} key={s.id} style={{left:s.start*zoom,width:Math.max(3,(s.end-s.start)*zoom)}} title={s.text} role="button" tabIndex={p.locked?-1:0} aria-label={`Napis: ${s.text}`} onPointerDown={e=>{e.stopPropagation();if(p.locked||p.project.tracks.T?.locked)return;setCaptionSelected(s.id);p.onCaptionMark?.(s.id);select([]);setSelected('');e.currentTarget.focus();p.onBeginAudio();e.currentTarget.setPointerCapture(e.pointerId);captionDrag.current={segment:s,edge:'move',x:e.clientX,next:p.project};}} onPointerMove={e=>{const d=captionDrag.current;if(!d||d.edge!=='move')return;e.stopPropagation();if(Math.abs(e.clientX-d.x)<3)return;d.next=moveCaption(p.project,d.segment,(e.clientX-d.x)/zoom);setCaptionDraft(d.next);}}
     onPointerUp={e=>{const d=captionDrag.current;if(!d||d.edge!=='move')return;e.stopPropagation();captionDrag.current=null;setCaptionDraft(null);if(d.next!==p.project)p.onCaptionChange(d.next);else p.onSeek(s.start);}} onPointerCancel={()=>{captionDrag.current=null;setCaptionDraft(null);}}
     onDoubleClick={e=>{e.stopPropagation();if(!p.locked&&!p.project.tracks.T?.locked)p.onCaptionSelect(s.id);}} onKeyDown={e=>{if(e.key==='Enter')p.onCaptionSelect(s.id);}}>
      {(['left','right'] as const).map(edge=><div key={edge} role="separator" aria-label={`${edge==='left'?'Początek':'Koniec'} napisu: ${s.text}`} className={`caption-trim ${edge}`} onPointerDown={e=>{e.stopPropagation();if(p.locked||p.project.tracks.T?.locked)return;e.currentTarget.setPointerCapture(e.pointerId);captionDrag.current={segment:s,edge,x:e.clientX,next:p.project};}}
       onPointerMove={e=>{e.stopPropagation();const d=captionDrag.current;if(!d||d.edge==='move')return;d.next=resizeCaption(p.project,d.segment,d.edge,(e.clientX-d.x)/zoom);setCaptionDraft(d.next);}}
       onPointerUp={e=>{e.stopPropagation();const d=captionDrag.current;captionDrag.current=null;setCaptionDraft(null);if(d)p.onCaptionChange(d.next);}} onPointerCancel={()=>{captionDrag.current=null;setCaptionDraft(null);}}/>)}<span>{s.text}</span>
    </div>)}
    {shown.filter(c=>c.kind!=='audio').flatMap(a=>{const b=shown.find(c=>c.id!==a.id&&c.kind!=='audio'&&(c.track??0)===(a.track??0)&&Math.abs(c.start-clipEnd(a))<1e-6);if(!b)return [];const existing=p.project.transitions.find(t=>t.fromId===a.id&&t.toId===b.id),length=existing?.duration??p.effectChoice.duration,top=clipTop(lanes,a);
      return [<button key={a.id+'join'} className={`transition-join ${existing?'has-transition':''} ${hoverJoin===a.id?'drop-preview':''}`} aria-label={existing?'Edytuj przejście':'Dodaj przejście'} title={`${existing?'Przejście':'Dodaj przejście'} · ${length.toFixed(2)} s`} style={{left:existing||hoverJoin===a.id?(b.start-(existing?.duration??0)/2)*zoom-length*zoom/2:b.start*zoom-7,width:existing||hoverJoin===a.id?Math.max(14,length*zoom):14,top}}
       disabled={p.locked||clipLocked(p.project,a)||clipLocked(p.project,b)} onContextMenu={e=>{e.preventDefault();setClipMenu({id:a.id,x:Math.min(e.clientX,window.innerWidth-235),y:Math.max(8,Math.min(e.clientY,window.innerHeight-260))});}} onPointerDown={e=>e.stopPropagation()} onClick={()=>existing?p.onTransitionSelect(existing.id):p.onTransition(a.id,b.id,p.effectChoice)}
       onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-rolvixa-transition')){e.preventDefault();setHoverJoin(a.id);}}} onDrop={e=>{e.preventDefault();setHoverJoin('');try{const choice=JSON.parse(e.dataTransfer.getData('application/x-rolvixa-transition'));if(transitionKinds.includes(choice.kind)&&Number.isFinite(choice.duration))p.onTransition(a.id,b.id,choice);}catch{}}}>{existing||hoverJoin===a.id?<><span>{existing?transitionLabels[existing.kind]:'Przejście'}</span><small>{length.toFixed(2)}s</small></>:<Icon name="add" size={12}/>}</button>];
    })}
    {mediaDrop&&<div className="media-drop-marker" style={{left:mediaDrop.at*zoom,top:(lanes.find(t=>t.id===mediaDrop.id)?.top??0)+3}}/>}
    {box&&<div className="timeline-marquee" style={box}/> }
    <div className="edit-playhead" style={{left:p.time*zoom}}><span><Icon name="playhead" size={12}/></span></div>
   </div>
  </div>
  </div>
  <div className="timeline-properties">
   {chosen?<><b>{detachedLabel(chosen)}</b><label>Ścieżka <select aria-label="Ścieżka klipu" value={chosen.track??0} disabled={p.locked||chosenLocked} onChange={e=>commit(changeTrack(clips,chosen.id,Number(e.target.value)))}>{tracksOf(p.project,chosen.kind==='audio'?'audio':'video').map(t=><option key={t.id} value={t.index} disabled={p.project.tracks[t.id]?.locked}>{t.id}</option>)}</select></label><label>Głośność <input aria-label="Głośność klipu" type="range" min={0} max={1} step={.01} value={chosen.volume??1} disabled={p.locked||chosenLocked||chosen.audioDetached} onChange={e=>{const gain=Number(e.target.value);p.onPreviewVolume(chosen.id,gain);p.onChange(clips.map(c=>c.id===chosen.id?{...c,volume:gain}:c),'volume');}}/>{Math.round((chosen.volume??1)*100)}%</label><label>Pozycja <input aria-label="Pozycja ujęcia" type="number" min={0} step={0.01} disabled={p.locked||chosenLocked} value={Number(chosen.start.toFixed(3))} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))commit(moveClip(clips,chosen.id,n,snap?10/zoom:0));}}/></label><fieldset className="clip-range-fields" disabled={p.locked||chosenLocked}><label>Wejście źródła <NumberEdit label="Wejście źródła" value={chosen.sourceIn} min={0} max={chosen.sourceOut-.05} onCommit={n=>request({kind:'trim',id:chosen.id,edge:'left',delta:n-chosen.sourceIn})}/></label><label>Wyjście źródła <NumberEdit label="Wyjście źródła" value={chosen.sourceOut} min={chosen.sourceIn+.05} max={clipMedia(p.project,chosen)?.duration??0} onCommit={n=>request({kind:'trim',id:chosen.id,edge:'right',delta:n-chosen.sourceOut})}/></label></fieldset></>:null}
   <input className="timeline-seek" aria-label="Pozycja odtwarzania" type="range" min={0} max={duration||1} step={0.01} value={Math.min(p.time,duration)} disabled={!duration||p.locked} onChange={e=>p.onSeek(Number(e.target.value))}/><code>{stamp(p.time)} / {stamp(duration)}</code>
  </div>
 {preview&&preview.base===p.project&&<aside className="ripple-notice" aria-label="Konflikt dosuwania">
  <p role="status"><b>Nie można dosunąć:</b> {preview.conflicts[0]}</p>
  {preview.conflicts.length>1&&<details><summary>Pozostałe powody ({preview.conflicts.length-1})</summary>{preview.conflicts.slice(1).map((reason,i)=><p key={i}>{reason}</p>)}</details>}
  <div><button disabled={p.locked} onClick={()=>{if(preview.base===p.project)change(preview.plain);closePreview();}}>Wykonaj samo cięcie</button><button onClick={closePreview}>Anuluj</button></div>
 </aside>}
 </section>
 {trackMenu&&<section className="track-settings-menu" aria-label={`Ustawienia ścieżki ${trackMenu.id}`} style={{left:trackMenu.x,top:trackMenu.y}} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setTrackMenu(null);}}}>
  <b>{trackMenu.id} · Ustawienia ścieżki</b>
  <label>Uwzględniaj w dosuwaniu<select autoFocus disabled={p.locked} aria-label={`Uwzględniaj w dosuwaniu ${trackMenu.id}`} value={p.project.tracks[trackMenu.id]?.ripple??'auto'} onChange={e=>change({...p.project,tracks:{...p.project.tracks,[trackMenu.id]:{...p.project.tracks[trackMenu.id],ripple:e.target.value as 'auto'|'on'|'off'}}})}><option value="auto">Automatycznie</option><option value="on">Zawsze</option><option value="off">Nigdy</option></select></label>
  <p>{rippleReason(rippleTrack(p.project,trackMenu.id))}</p><button onClick={()=>setTrackMenu(null)}>Zamknij</button>
 </section>}

 {clipMenu&&<div role="menu" className="clip-context-menu" style={{left:clipMenu.x,top:clipMenu.y}} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')setClipMenu(null);}}>
  {clips.find(c=>c.id===clipMenu.id)?.kind!=='audio'&&<><button role="menuitem" disabled={p.locked} onClick={()=>{try{p.onSmartCut(defaultCutRequest(p.project,clipMenu.id,p.time));setClipMenu(null);}catch(e){p.onError(String(e));}}}>SmartCut · wytnij zakres</button><button role="menuitem" disabled={p.locked||!joinAfter(p.project,clipMenu.id)} onClick={()=>{const b=joinAfter(p.project,clipMenu.id);if(b)p.onSmartCut({kind:'join',id:clipMenu.id,toId:b.id,at:b.start});setClipMenu(null);}}>SmartCut · popraw połączenie</button></>}
  {tracksOf(p.project,'audio').map(({index:t})=><button key={t} role="menuitem" disabled={clipLocked(p.project,clips.find(c=>c.id===clipMenu.id)!)||clips.find(c=>c.id===clipMenu.id)?.kind==='audio'||clips.find(c=>c.id===clipMenu.id)?.audioDetached||p.project.tracks[trackId('audio',t)]?.locked} onClick={()=>{try{change(detachAudio(p.project,clipMenu.id,t));}catch(e){p.onError(String(e));}setClipMenu(null);}}>Odłącz audio → A{t+1}</button>)}
  <button role="menuitem" disabled={clips.find(c=>c.id===clipMenu.id)?.kind!=='audio'||syncOffset(p.project,clips.find(c=>c.id===clipMenu.id)!)==null} onClick={()=>{try{change(realignAudio(p.project,clipMenu.id));}catch(e){p.onError(String(e));}setClipMenu(null);}}>Zsynchronizuj audio z obrazem</button>
 </div>}
 </>;
}
