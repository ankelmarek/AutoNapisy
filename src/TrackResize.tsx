import {useEffect,useRef,type PointerEvent} from 'react';
import {boundedHeight} from './timelineView';
import type {TrackKind} from './trackModel';
type Props={id:string;kind:TrackKind;value:number;rows:number;embedded:boolean;disabled:boolean;onDraft:(value:number|null)=>void;onCommit:(value:number)=>void};
export default function TrackResize(p:Props){
 const current=useRef(p);current.current=p;
 const drag=useRef<{y:number;value:number;next:number}|null>(null);
 const cancel=()=>{drag.current=null;current.current.onDraft(null);};
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();e.stopPropagation();cancel();}};window.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);return()=>{window.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);};},[]);
 const update=(value:number)=>boundedHeight(p.kind,value,p.embedded);
 return <span className="track-resize" role="separator" tabIndex={p.disabled?-1:0} aria-disabled={p.disabled} aria-orientation="horizontal" aria-label={`Wysokość ścieżki ${p.id}`} aria-valuemin={p.embedded?84:40} aria-valuemax={240} aria-valuenow={Math.round(p.value)} title="Przeciągnij wysokość · strzałki góra/dół · dwuklik: reset · Escape: anuluj"
 onPointerDown={(e:PointerEvent)=>{if(p.disabled||e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);drag.current={y:e.clientY,value:p.value,next:p.value};}}
 onPointerMove={e=>{const d=drag.current;if(!d)return;e.stopPropagation();d.next=update(d.value+(e.clientY-d.y)/p.rows);p.onDraft(d.next);}}
 onPointerUp={e=>{if(!drag.current)return;e.stopPropagation();const d=drag.current;drag.current=null;p.onCommit(d.next);p.onDraft(null);}}
 onPointerCancel={cancel} onLostPointerCapture={()=>{if(drag.current)cancel();}}
 onDoubleClick={()=>{if(!p.disabled)p.onCommit(p.kind==='audio'?56:p.embedded?84:40);}}
 onKeyDown={e=>{if(p.disabled)return;const delta=e.shiftKey?24:8;if(['ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();e.stopPropagation();p.onCommit(update(e.key==='Home'?(p.kind==='audio'?56:p.embedded?84:40):p.value+(e.key==='ArrowDown'?delta:-delta)));}}}/>;
}
