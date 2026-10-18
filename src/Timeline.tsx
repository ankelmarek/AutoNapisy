import {useRef,useState,useMemo,useEffect,type PointerEvent} from 'react';
import {decodeSourceDrop,SOURCE_RANGE_TYPE,type SourceRange} from './sourceSelection';
import type {Project} from './model';
import Icon from './Icons';
import RipplePreview from './RipplePreview';
import {planEdit,rippleTrack,trackParticipates,rippleReason,type EditOperation,type RipplePlan} from './ripple';
import {detachAudio,detachedLabel,syncOffset,realignAudio} from './detachedAudio';
import AudioAutomation from './AudioAutomation';
import {NumberEdit} from './AudioProperties';
import {resizeCaption,editCaption} from './captionEditing';
import type {EditedSegment} from './editing';
import {timelineClips} from './effects';
import {transitionKinds,transitionLabels} from './transitionCatalog';
import type {EffectChoice} from './EffectsLibrary';
import AudioWaveform from './AudioWaveform';
import {toggleTrack,clipMuted,videoHidden,clipLocked,type TrackId} from './trackControls';
import {tracksOf,trackId,routedAudio,MAX_TRACKS,type TrackKind} from './trackModel';
import {addTrack,removeTrack,timelineLayout,laneAt,clipTop,clipLane,clipHeight} from './tracks';
import {clipAt,clipEnd,compositionSegments,editDuration,moveClip,projectClips,splitClip,trimClip,clipMedia,changeTrack,type Clip} from './editing';
const stamp=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toFixed(2).padStart(5,'0')}`;
type Props={project:Project;time:number;locked:boolean;onSeek:(t:number)=>void;onPreviewOpen:(v:boolean)=>void;onError:(e:string)=>void;onChange:(clips:Clip[],mode?:'volume')=>void;onPreviewVolume:(id:string,gain:number)=>void;onBeginAudio:()=>void;undo:()=>void;redo:()=>void;canUndo:boolean;canRedo:boolean;onSelect:(id:string)=>void;onCaptionSelect:(id:string)=>void;onCaptionChange:(p:Project)=>void;effectChoice:EffectChoice;onTransition:(from:string,to:string,choice:EffectChoice)=>void;onTransitionSelect:(id:string)=>void;onMediaDrop:(id:string,at:number,track:number,range?:SourceRange,kind?:TrackKind)=>void};
export default function Timeline(p:Props){
 const clips=projectClips(p.project),duration=editDuration(p.project);
 const [tool,setTool]=useState<'select'|'razor'>('select'),[snap,setSnap]=useState(true),[zoom,setZoom]=useState(30),[selected,setSelected]=useState(''),[draft,setDraft]=useState<Clip[]|null>(null);
 const [preview,setPreview]=useState<RipplePlan|null>(null),[clipMenu,setClipMenu]=useState<{id:string;x:number;y:number}|null>(null);
 const [compact,setCompact]=useState<Set<string>>(new Set()),[tall,setTall]=useState<Set<string>>(new Set());
 const shown=draft??clips,lanes=timelineLayout(p.project,clips,compact,tall),canvasHeight=Math.max(256,...lanes.map(t=>t.top+t.height)),chosen=shown.find(c=>c.id===selected),chosenLocked=!!chosen&&clipLocked(p.project,chosen);
 const change=(next:Project)=>{try{if(JSON.stringify(next)!==JSON.stringify(p.project))p.onCaptionChange(next);}catch(e){p.onError(String(e));}};
 const closePreview=()=>{setPreview(null);p.onPreviewOpen(false);};
 const request=(op:EditOperation)=>{try{const plan=planEdit(p.project,op);setDraft(null);if(plan.active&&plan.changes.length){p.onBeginAudio();setPreview(plan);p.onPreviewOpen(true);}else change(plan.plain);}catch(e){p.onError(String(e));}};
 useEffect(()=>{if(preview&&preview.base!==p.project)closePreview();},[p.project]);
 useEffect(()=>{if(!clipMenu)return;const close=()=>setClipMenu(null);window.addEventListener('pointerdown',close);return()=>window.removeEventListener('pointerdown',close);},[clipMenu]);
 const canvas=useRef<HTMLDivElement>(null),scroller=useRef<HTMLDivElement>(null);
 const pan=useRef<{x:number;left:number}|null>(null);
 const copied=useRef<Clip|null>(null);
 const captionDrag=useRef<{segment:EditedSegment;edge:'left'|'right';x:number;next:Project}|null>(null);
 const [captionDraft,setCaptionDraft]=useState<Project|null>(null),[captionSelected,setCaptionSelected]=useState(''),[hoverJoin,setHoverJoin]=useState('');
 const [scroll,setScroll]=useState(0),[viewport,setViewport]=useState(window.innerWidth);
 useEffect(()=>{const resize=()=>setViewport(window.innerWidth);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 const visibleCaptions=useMemo(()=>compositionSegments(captionDraft??{...p.project,clips:shown}).filter(s=>s.end*zoom>=scroll && s.start*zoom<=scroll+viewport),[p.project,shown,zoom,scroll,viewport,captionDraft]);
 const drag=useRef<{id:string;kind:'move'|'left'|'right';x:number;y:number;audioDrag:boolean;base:Clip[];value:Clip[];moved:boolean;operation?:EditOperation}|null>(null);
 const point=(e:PointerEvent)=>Math.max(0,(e.clientX-(canvas.current?.getBoundingClientRect().left??0))/zoom);
 const scrubbing=useRef(false);
 const commit=(next:Clip[])=>{p.onChange(next);setDraft(null);};
 const cut=(id:string,t:number)=>{const c=clips.find(c=>c.id===id);if(!c||clipLocked(p.project,c))return;const next=splitClip(clips,id,t);if(next!==clips)commit(next);};
 const remove=()=>{if(captionSelected){if(p.project.tracks.T?.locked)return;const s=compositionSegments(p.project).find(s=>s.id===captionSelected);if(s)p.onCaptionChange(editCaption(p.project,s,{hidden:true}));setCaptionSelected('');return;}if(chosen&&!chosenLocked){request({kind:'delete',id:selected});setSelected('');}};
 const start=(e:PointerEvent,id:string,kind:'move'|'left'|'right',mirror=false)=>{
  if(p.locked)return;e.stopPropagation();if(e.button!==0)return;setSelected(id);setCaptionSelected('');p.onSelect(id);
  if(clipLocked(p.project,clips.find(c=>c.id===id)!))return;
  p.onBeginAudio();
  if(tool==='razor'&&kind==='move'){cut(id,point(e));return;}
  e.currentTarget.setPointerCapture(e.pointerId);drag.current={id,kind,x:e.clientX,y:e.clientY,audioDrag:mirror||clips.find(c=>c.id===id)?.kind==='audio',base:clips,value:clips,moved:false};
 };
 const move=(e:PointerEvent)=>{
  const d=drag.current;if(!d||p.locked)return;
  if(Math.abs(e.clientX-d.x)<3&&Math.abs(e.clientY-d.y)<10&&!d.moved)return;d.moved=true;
  const c=d.base.find(x=>x.id===d.id)!;let delta=(e.clientX-d.x)/zoom;
  if(d.kind==='move'){
   let next=c;const target=laneAt(lanes,e.clientY-(canvas.current?.getBoundingClientRect().top??0));
   if(Math.abs(e.clientY-d.y)>20&&target){
    if(c.kind==='audio'&&target.kind==='audio')next={...c,track:target.index};
    else if(c.kind!=='audio'&&d.audioDrag){if(target.kind==='audio')next={...c,audioRoute:target.id};else if(target.id===trackId('video',c.track??0))next={...c,audioRoute:'embedded'};}
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
  setDraft(d.value);
 };
 const end=(e:PointerEvent)=>{const d=drag.current;if(!d)return;drag.current=null;if(d.moved){if(d.operation)request(d.operation);else commit(d.value);}else p.onSeek(point(e));};
 useEffect(()=>{if(drag.current && drag.current.base!==clips){drag.current=null;setDraft(null);}},[clips]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();drag.current=null;setDraft(null);return;}if(document.activeElement?.closest('.source-viewer'))return;
  if(p.locked||preview||clipMenu||e.altKey||(e.target instanceof HTMLElement&&(e.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))))return;
  const modifier=e.ctrlKey||e.metaKey;
  if(modifier&&e.key.toLowerCase()==='c'){if(chosen){e.preventDefault();copied.current={...chosen,adjustments:chosen.adjustments?{...chosen.adjustments}:undefined};}return;}
  if(modifier&&e.key.toLowerCase()==='v'){if(copied.current){e.preventDefault();if(clips.length>=100)return;const copy={...copied.current,syncGroup:undefined,id:crypto.randomUUID(),start:Math.max(p.time,duration)};commit(moveClip([...clips,copy],copy.id,p.time,snap?10/zoom:0));}return;}
  if(modifier&&e.key.toLowerCase()==='x'){if(chosen&&!chosenLocked){e.preventDefault();copied.current={...chosen};remove();}return;}
  if(modifier&&e.key.toLowerCase()==='d'){if(chosen&&clips.length<100){e.preventDefault();const copy={...chosen,syncGroup:undefined,id:crypto.randomUUID(),start:duration};commit(moveClip([...clips,copy],copy.id,clipEnd(chosen),snap?10/zoom:0));}return;}
  if(modifier)return;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(captionSelected){if(p.project.tracks.T?.locked)return;const s=compositionSegments(p.project).find(s=>s.id===captionSelected);if(s)p.onCaptionChange(editCaption(p.project,s,{hidden:true}));setCaptionSelected('');}else remove();return;}
  if(e.key.toLowerCase()==='c')setTool('razor');if(e.key.toLowerCase()==='v')setTool('select');
 };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[p.locked,p.project,p.time,selected,captionSelected,preview,clipMenu]);
 const [mediaDrop,setMediaDrop]=useState<{at:number;id:string}|null>(null);
 const width=Math.max(900,viewport-40,(Math.max(duration,...shown.map(clipEnd))+5)*zoom);
 const tick=[1,2,5,10,30,60,120,300,600,1800,3600].find(x=>x*zoom>=90)??3600;
 return <><section className="edit-timeline" aria-label="Montaż filmu">
  <div className="timeline-toolbar">
   <button disabled={p.locked} aria-pressed={tool==='select'} onClick={()=>setTool('select')} aria-label="Zaznacz" title="Zaznacz" className="icon-button"><Icon name="cursor"/></button>
   <button disabled={p.locked} aria-pressed={tool==='razor'} onClick={()=>setTool('razor')} aria-label="Żyletka" title="Żyletka" className="icon-button"><Icon name="razor"/></button>
   <button disabled={p.locked||!(chosen??clipAt(clips,p.time))} onClick={()=>{const c=chosen??clipAt(clips,p.time);if(c)cut(c.id,p.time);}} aria-label="Przetnij tutaj" title="Przetnij tutaj" className="icon-button"><Icon name="cut"/></button>
   <button disabled={p.locked||(!chosen&&!captionSelected)} onClick={remove} aria-label="Usuń zaznaczenie" title="Usuń zaznaczenie" className="icon-button"><Icon name="trash"/></button>
   <button disabled={p.locked} aria-pressed={p.project.rippleEnabled} aria-label="Tryb Ripple" title="Ripple: domykanie lub rozsuwanie po cięciu. Przed zmianą zobaczysz podgląd." onClick={()=>change({...p.project,rippleEnabled:!p.project.rippleEnabled})} className="ripple-toggle"><Icon name="pack" size={16}/> Ripple {p.project.rippleEnabled?'On':'Off'}</button>
   {!clips.length && (p.project.media?.duration??0)>=.05 && <button disabled={p.locked} onClick={()=>commit([{id:crypto.randomUUID(),sourceIn:0,sourceOut:p.project.media!.duration!,start:0}])} aria-label="Przywróć cały film" title="Przywróć cały film" className="icon-button"><Icon name="restore"/></button>}
   <button disabled={p.locked} aria-pressed={snap} onClick={()=>setSnap(!snap)} aria-label="Magnes" title={`Magnes: ${snap?'włączony':'wyłączony'}`} className="icon-button"><Icon name="magnet"/></button>
   <button disabled={p.locked||!p.canUndo} onClick={p.undo} aria-label="Cofnij" title="Cofnij" className="icon-button"><Icon name="undo"/></button>
   <button disabled={p.locked||!p.canRedo} onClick={p.redo} aria-label="Ponów" title="Ponów" className="icon-button"><Icon name="redo"/></button>
   {(['video','audio'] as const).map(kind=><button key={kind} disabled={p.locked||tracksOf(p.project,kind).length>=MAX_TRACKS} aria-label={`Dodaj ścieżkę ${kind==='video'?'wideo':'audio'}`} title={`Dodaj niezależną ścieżkę ${kind==='video'?'wideo':'audio'}`} onClick={()=>{try{change(addTrack(p.project,kind));}catch(e){p.onError(String(e));}}} className="add-track"><Icon name="add" size={13}/>{kind==='video'?'V':'A'}</button>)}
   <label className="timeline-zoom"><Icon name="zoom" size={16}/><input aria-label="Powiększenie osi czasu" type="range" min={2} max={160} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>
  </div>
  <div className="timeline-body">
  <div className="track-heads" aria-label="Sterowanie ścieżkami" style={{height:canvasHeight}}>
   <div className="track-head-ruler"><Icon name="video" size={14}/></div>
   {lanes.map(({id:rawId,top,height,index,kind})=>{const id=rawId as TrackId;
    const state=p.project.tracks[id],isVideo=id.startsWith('V'),r=rippleTrack(p.project,id);
    return <div key={id} className="track-head" style={{top,height}}><b>{id}</b><div>
     <button disabled={p.locked} aria-label={`Blokada ${id}`} aria-pressed={!!state?.locked} title={`${state?.locked?'Odblokuj':'Zablokuj'} ${id}`} onClick={()=>change({...p.project,tracks:{...p.project.tracks,[id]:{...state,locked:!state?.locked}}})}><Icon name={state?.locked?'lock':'lockOpen'} size={12}/><span className="sr-only">Blokada</span></button>
     <select className="track-ripple" disabled={p.locked} aria-label={`Ripple ${id}`} title={rippleReason(r)} data-enabled={trackParticipates(r)} value={state?.ripple??'auto'} onChange={e=>change({...p.project,tracks:{...p.project.tracks,[id]:{...state,ripple:e.target.value as 'auto'|'on'|'off'}}})}><option value="auto">R·A</option><option value="on">R+</option><option value="off">R−</option></select>
     {id!=='T'&&<button disabled={p.locked} aria-label={`Wycisz ${id}`} aria-pressed={!!state?.muted} title={isVideo?`Wycisz dźwięk filmów na ${id}`:`Wycisz wszystkie dźwięki na ${id}`} onClick={()=>p.onCaptionChange(toggleTrack(p.project,id,'muted'))}><Icon name={state?.muted?'speakerOff':'speaker'} size={14}/></button>}
     {(isVideo||id==='T')&&<button disabled={p.locked} aria-label={`Ukryj ${id}`} aria-pressed={!!state?.hidden} title={state?.hidden?`Pokaż ${id}`:`Ukryj ${id} w podglądzie i eksporcie`} onClick={()=>p.onCaptionChange(toggleTrack(p.project,id,'hidden'))}><Icon name={state?.hidden?'eyeOff':'eye'} size={14}/></button>}
     {id!=='T'&&<button className="track-collapse" disabled={p.locked} aria-label={`Zwiń ${id}`} aria-pressed={compact.has(id)} title={`Zwiń / rozwiń ${id}`} onClick={()=>setCompact(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next;})}><Icon name="chevronDown" size={11}/></button>}
     {kind==='audio'&&!compact.has(id)&&<button className="track-height" disabled={p.locked} aria-label={`Wysokość ${id}`} title={`Zmień wysokość ${id}`} onClick={()=>setTall(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next;})}><Icon name="audio" size={11}/></button>}
     {id!=='T'&&index>=2&&<button className="track-remove" disabled={p.locked||state?.locked} aria-label={`Usuń ścieżkę ${id}`} title={`Usuń ścieżkę ${id}`} onClick={()=>{try{const contains=clips.some(c=>(c.kind==='audio'?'audio':'video')===kind&&(c.track??0)===index);if(contains&&!window.confirm(`Usunąć ścieżkę ${id} wraz z jej klipami? Możesz cofnąć tę operację.`))return;change(removeTrack(p.project,id,contains));}catch(e){p.onError(String(e));}}}><Icon name="x" size={11}/></button>}
    </div></div>;
   })}
  </div>
  <div className="timeline-scroll" ref={scroller}
   onPointerDownCapture={e=>{if((!e.altKey&&e.button!==1)||(e.button===0&&(e.target as Element).closest('[data-audio-automation]')))return;e.preventDefault();e.stopPropagation();pan.current={x:e.clientX,left:e.currentTarget.scrollLeft};e.currentTarget.setPointerCapture(e.pointerId);}}
   onPointerMoveCapture={e=>{if(!pan.current)return;e.preventDefault();e.stopPropagation();e.currentTarget.scrollLeft=pan.current.left-(e.clientX-pan.current.x);}}
   onPointerUpCapture={e=>{if(pan.current){e.stopPropagation();pan.current=null;}}} onPointerCancelCapture={()=>pan.current=null} onScroll={e=>setScroll(e.currentTarget.scrollLeft)}>
   <div ref={canvas} className={`edit-canvas ${tool}`} style={{width,height:canvasHeight}} onDragOver={e=>{if(p.locked||!e.dataTransfer.types.includes('application/x-rolvixa-media'))return;const rect=e.currentTarget.getBoundingClientRect(),target=laneAt(lanes,e.clientY-rect.top);if(!target){setMediaDrop(null);return;}e.preventDefault();e.dataTransfer.dropEffect='copy';setMediaDrop({at:Math.max(0,(e.clientX-rect.left)/zoom),id:target.id});}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setMediaDrop(null);}} onDrop={e=>{if(p.locked||!e.dataTransfer.types.includes('application/x-rolvixa-media'))return;e.preventDefault();const rect=e.currentTarget.getBoundingClientRect(),target=laneAt(lanes,e.clientY-rect.top);if(target)try{const raw=e.dataTransfer.getData(SOURCE_RANGE_TYPE),drop=raw?decodeSourceDrop(raw):{id:e.dataTransfer.getData('application/x-rolvixa-media'),range:undefined};p.onMediaDrop(drop.id,Math.max(0,(e.clientX-rect.left)/zoom),target.index,drop.range,target.kind as TrackKind);}catch{}setMediaDrop(null);}} onPointerDown={e=>{if(!p.locked){scrubbing.current=true;e.currentTarget.setPointerCapture(e.pointerId);p.onSeek(point(e));}}} onPointerMove={e=>{if(scrubbing.current&&!p.locked)p.onSeek(point(e));}} onPointerUp={()=>{scrubbing.current=false;}} onPointerCancel={()=>{scrubbing.current=false;}}>
    <div className="edit-ruler">{Array.from({length:Math.ceil(viewport/zoom/tick)+3},(_,n)=>Math.max(0,Math.floor(scroll/zoom/tick)-1)+n).filter(i=>i*tick*zoom<=width).map(i=><span key={i} style={{left:i*tick*zoom}}>{stamp(i*tick)}</span>)}</div>
    {lanes.filter(t=>t.kind!=='captions').map(t=><div key={t.id} data-lane-id={t.id} className="multi-lane" style={{top:t.top,height:t.height}}/>)}
    {timelineClips(p.project,shown).flatMap(c=>c.kind==='audio'||c.audioDetached||(routedAudio(c)===null&&compact.has(trackId('video',c.track??0)))?[{c,mirror:false}]:[{c,mirror:false},{c,mirror:true}]).map(({c,mirror},i)=><div key={c.id+(mirror?'-sound':'')} role="button" tabIndex={p.locked?-1:0} aria-label={`${mirror?'Dźwięk połączony':c.kind==='audio'?'Audio':'Ujęcie'} ${i+1}`} aria-pressed={c.id===selected} data-clip-id={c.id} data-kind={c.kind??'video'} data-detached={!!c.audioDetached} className={`edit-clip ${clipLane(lanes,c,mirror)?.collapsed?'compact-clip':''} ${clipLocked(p.project,c)?'clip-is-locked':''} ${mirror||c.kind==='audio'?'audio-clip':''} ${c.id===selected?'selected':''} ${(mirror||c.kind==='audio')?clipMuted(p.project,c)?'track-is-muted':'':videoHidden(p.project,c)?'track-is-hidden':''}`} style={{top:clipTop(lanes,c,mirror),height:clipHeight(lanes,c,mirror),left:c.start*zoom,width:(c.sourceOut-c.sourceIn)*zoom}} onFocus={()=>{setSelected(c.id);setCaptionSelected('');p.onSelect(c.id);}} onContextMenu={e=>{e.preventDefault();if(p.locked)return;setSelected(c.id);p.onSelect(c.id);setClipMenu({id:c.id,x:Math.min(e.clientX,window.innerWidth-235),y:Math.min(e.clientY,window.innerHeight-160)});}} onKeyDown={e=>{if(p.locked)return;if(e.key==='Delete'){e.preventDefault();e.stopPropagation();request({kind:'delete',id:c.id});}if(e.key==='Enter')p.onSeek(c.start);}} onPointerDown={e=>start(e,c.id,'move',mirror)} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{drag.current=null;setDraft(null);}} title={`${clipMedia(p.project,c)?.name}\nŹródło ${stamp(c.sourceIn)} – ${stamp(c.sourceOut)}\nOś ${stamp(c.start)} – ${stamp(clipEnd(c))}`}>
     <div className="trim-handle left" role="separator" aria-label={`Lewy brzeg ujęcia ${i+1}`} onPointerDown={e=>start(e,c.id,'left',mirror)}/>
     <span>{mirror&&<Icon name="link" size={10}/>} {clipMedia(p.project,c)?.name}</span><small>{stamp(c.sourceIn)} → {stamp(c.sourceOut)}</small>
     {(mirror||c.kind==='audio')&&<AudioWaveform path={clipMedia(p.project,c)?.path} duration={clipMedia(p.project,c)?.duration??0} sourceIn={c.sourceIn} sourceOut={c.sourceOut}/>}
     {(mirror||c.kind==='audio')&&<AudioAutomation clip={c} zoom={zoom} name={clipMedia(p.project,c)?.name??'audio'} disabled={p.locked||clipLocked(p.project,c)} onBegin={p.onBeginAudio}
       onCommit={next=>p.onChange(clips.map(x=>x.id===c.id?{...x,volume:next.volume,audio:next.audio}:x),'volume')}/>}
     <div className="trim-handle right" role="separator" aria-label={`Prawy brzeg ujęcia ${i+1}`} onPointerDown={e=>start(e,c.id,'right',mirror)}/>
    </div>)}

    {visibleCaptions.map(s=><div className={`caption-timeline-clip ${captionSelected===s.id?'selected':''} ${p.project.tracks.T?.hidden?'track-is-hidden':''}`} key={s.id} style={{left:s.start*zoom,width:Math.max(3,(s.end-s.start)*zoom)}} title={s.text} role="button" tabIndex={p.locked?-1:0} aria-label={`Napis: ${s.text}`} onPointerDown={e=>{e.stopPropagation();if(p.locked||p.project.tracks.T?.locked)return;setCaptionSelected(s.id);setSelected('');e.currentTarget.focus();p.onSeek(s.start);}} onDoubleClick={e=>{e.stopPropagation();if(!p.locked&&!p.project.tracks.T?.locked)p.onCaptionSelect(s.id);}} onKeyDown={e=>{if(e.key==='Enter')p.onCaptionSelect(s.id);}}>
      {(['left','right'] as const).map(edge=><div key={edge} role="separator" aria-label={`${edge==='left'?'Początek':'Koniec'} napisu: ${s.text}`} className={`caption-trim ${edge}`} onPointerDown={e=>{e.stopPropagation();if(p.locked||p.project.tracks.T?.locked)return;e.currentTarget.setPointerCapture(e.pointerId);captionDrag.current={segment:s,edge,x:e.clientX,next:p.project};}}
       onPointerMove={e=>{e.stopPropagation();const d=captionDrag.current;if(!d)return;d.next=resizeCaption(p.project,d.segment,d.edge,(e.clientX-d.x)/zoom);setCaptionDraft(d.next);}}
       onPointerUp={e=>{e.stopPropagation();const d=captionDrag.current;captionDrag.current=null;setCaptionDraft(null);if(d)p.onCaptionChange(d.next);}} onPointerCancel={()=>{captionDrag.current=null;setCaptionDraft(null);}}/>)}<span>{s.text}</span>
    </div>)}
    {shown.filter(c=>c.kind!=='audio').flatMap(a=>{const b=shown.find(c=>c.id!==a.id&&c.kind!=='audio'&&(c.track??0)===(a.track??0)&&Math.abs(c.start-clipEnd(a))<1e-6);if(!b)return [];const existing=p.project.transitions.find(t=>t.fromId===a.id&&t.toId===b.id),length=existing?.duration??p.effectChoice.duration,top=clipTop(lanes,a);
      return [<button key={a.id+'join'} className={`transition-join ${existing?'has-transition':''} ${hoverJoin===a.id?'drop-preview':''}`} aria-label={existing?'Edytuj przejście':'Dodaj przejście'} title={`${existing?'Przejście':'Dodaj przejście'} · ${length.toFixed(2)} s`} style={{left:existing||hoverJoin===a.id?(b.start-(existing?.duration??0)/2)*zoom-length*zoom/2:b.start*zoom-7,width:existing||hoverJoin===a.id?Math.max(14,length*zoom):14,top}}
       disabled={p.locked||clipLocked(p.project,a)||clipLocked(p.project,b)} onPointerDown={e=>e.stopPropagation()} onClick={()=>existing?p.onTransitionSelect(existing.id):p.onTransition(a.id,b.id,p.effectChoice)}
       onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-rolvixa-transition')){e.preventDefault();setHoverJoin(a.id);}}} onDragLeave={()=>setHoverJoin('')} onDrop={e=>{e.preventDefault();setHoverJoin('');try{const choice=JSON.parse(e.dataTransfer.getData('application/x-rolvixa-transition'));if(transitionKinds.includes(choice.kind)&&Number.isFinite(choice.duration))p.onTransition(a.id,b.id,choice);}catch{}}}>{existing||hoverJoin===a.id?<><span>{existing?transitionLabels[existing.kind]:'Przejście'}</span><small>{length.toFixed(2)}s</small></>:<Icon name="add" size={12}/>}</button>];
    })}
    {mediaDrop&&<div className="media-drop-marker" style={{left:mediaDrop.at*zoom,top:(lanes.find(t=>t.id===mediaDrop.id)?.top??0)+3}}/>}
    <div className="edit-playhead" style={{left:p.time*zoom}}><span><Icon name="playhead" size={12}/></span></div>
   </div>
  </div>
  </div>
  <div className="timeline-properties">
   {chosen?<><b>{detachedLabel(chosen)}</b><label>Ścieżka <select aria-label="Ścieżka klipu" value={chosen.track??0} disabled={p.locked||chosenLocked} onChange={e=>commit(changeTrack(clips,chosen.id,Number(e.target.value)))}>{tracksOf(p.project,chosen.kind==='audio'?'audio':'video').map(t=><option key={t.id} value={t.index} disabled={p.project.tracks[t.id]?.locked}>{t.id}</option>)}</select></label><label>Głośność <input aria-label="Głośność klipu" type="range" min={0} max={1} step={.01} value={chosen.volume??1} disabled={p.locked||chosenLocked||chosen.audioDetached} onChange={e=>{const gain=Number(e.target.value);p.onPreviewVolume(chosen.id,gain);p.onChange(clips.map(c=>c.id===chosen.id?{...c,volume:gain}:c),'volume');}}/>{Math.round((chosen.volume??1)*100)}%</label><label>Pozycja <input aria-label="Pozycja ujęcia" type="number" min={0} step={0.01} disabled={p.locked||chosenLocked} value={Number(chosen.start.toFixed(3))} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))commit(moveClip(clips,chosen.id,n,snap?10/zoom:0));}}/></label><fieldset className="clip-range-fields" disabled={p.locked||chosenLocked}><label>Wejście źródła <NumberEdit label="Wejście źródła" value={chosen.sourceIn} min={0} max={chosen.sourceOut-.05} onCommit={n=>request({kind:'trim',id:chosen.id,edge:'left',delta:n-chosen.sourceIn})}/></label><label>Wyjście źródła <NumberEdit label="Wyjście źródła" value={chosen.sourceOut} min={chosen.sourceIn+.05} max={clipMedia(p.project,chosen)?.duration??0} onCommit={n=>request({kind:'trim',id:chosen.id,edge:'right',delta:n-chosen.sourceOut})}/></label></fieldset></>:null}
   <input className="timeline-seek" aria-label="Pozycja odtwarzania" type="range" min={0} max={duration||1} step={0.01} value={Math.min(p.time,duration)} disabled={!duration||p.locked} onChange={e=>p.onSeek(Number(e.target.value))}/><code>{stamp(p.time)} / {stamp(duration)}</code>
  </div>
 </section>
 {preview&&<RipplePreview plan={preview} onCancel={closePreview} onApply={()=>{if(preview.base===p.project&&!preview.conflicts.length)change(preview.next);closePreview();}} onPlain={()=>{if(preview.base===p.project)change(preview.plain);closePreview();}}/>}
 {clipMenu&&<div role="menu" className="clip-context-menu" style={{left:clipMenu.x,top:clipMenu.y}} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')setClipMenu(null);}}>
  {tracksOf(p.project,'audio').map(({index:t})=><button key={t} role="menuitem" disabled={clipLocked(p.project,clips.find(c=>c.id===clipMenu.id)!)||clips.find(c=>c.id===clipMenu.id)?.kind==='audio'||clips.find(c=>c.id===clipMenu.id)?.audioDetached||p.project.tracks[trackId('audio',t)]?.locked} onClick={()=>{try{change(detachAudio(p.project,clipMenu.id,t));}catch(e){p.onError(String(e));}setClipMenu(null);}}>Odłącz audio → A{t+1}</button>)}
  <button role="menuitem" disabled={clips.find(c=>c.id===clipMenu.id)?.kind!=='audio'||syncOffset(p.project,clips.find(c=>c.id===clipMenu.id)!)==null} onClick={()=>{try{change(realignAudio(p.project,clipMenu.id));}catch(e){p.onError(String(e));}setClipMenu(null);}}>Zsynchronizuj audio z obrazem</button>
 </div>}
 </>;
}
