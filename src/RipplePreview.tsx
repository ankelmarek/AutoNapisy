import {useEffect,useRef} from 'react';
import type {RipplePlan} from './ripple';
import {editDuration} from './editing';
import Icon from './Icons';
const clock=(t:number)=>`${Math.floor(Math.max(0,t)/60).toString().padStart(2,'0')}:${(Math.max(0,t)%60).toFixed(3).padStart(6,'0')}`;
export default function RipplePreview({plan,onApply,onPlain,onCancel}:{plan:RipplePlan;onApply:()=>void;onPlain:()=>void;onCancel:()=>void}){
 const root=useRef<HTMLElement>(null);
 useEffect(()=>{const prev=document.activeElement;root.current?.querySelector<HTMLButtonElement>('button')?.focus();return()=>{if(prev instanceof HTMLElement&&prev.isConnected)prev.focus();};},[]);
 const extent=Math.max(.1,editDuration(plan.base),editDuration(plan.next));
 return <div className="overlay ripple-overlay" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onCancel();}if(e.key==='Tab'){const nodes=Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}}}>
 <section ref={root} className="modal ripple-dialog" role="dialog" aria-modal="true" aria-labelledby="ripple-heading">
 <h2 id="ripple-heading"><Icon name="pack"/> Podgląd Ripple</h2><p>{plan.changes.length} zmienianych elementów · {plan.delta<0?'Domknięcie':'Rozsunięcie'} {Math.abs(plan.delta).toFixed(3)} s · Montaż {clock(editDuration(plan.base))} → {clock(editDuration(plan.next))}</p>
 <div className="ripple-legend"><i/> Przed zmianą <i/> Po zmianie</div>
 <div className="ripple-changes">{plan.changes.map(c=><div key={`${c.track}:${c.id}`} className="ripple-change"><b>{c.track}</b><div className="ripple-ghosts" aria-hidden="true"><i style={{left:`${100*c.before/extent}%`,width:`${100*(c.oldEnd-c.before)/extent}%`}}/>{!c.removed&&<i style={{left:`${100*c.after/extent}%`,width:`${100*(c.newEnd-c.after)/extent}%`}}/>}</div><small>{clock(c.before)} → {c.removed?'Usuń':clock(c.after)}</small></div>)}</div>
 {!!plan.removedTransitions&&<p role="status">Usunięte przejścia: {plan.removedTransitions}. Ich klipy przestają tworzyć poprawne złączenie.</p>}
 {plan.conflicts.length>0&&<div className="ripple-conflicts" role="alert"><b>Najpierw rozwiąż konflikty</b>{plan.conflicts.map((s,i)=><p key={i}>{s}</p>)}<p>Możesz anulować i zmienić R/blokadę torów albo wykonać samo cięcie bez przesuwania pozostałych elementów.</p></div>}
 <div className="recovery-actions"><button onClick={onCancel}>Anuluj</button><button onClick={onPlain}>Wykonaj bez Ripple</button><button className="primary" disabled={plan.conflicts.length>0} onClick={onApply}>Zastosuj Ripple</button></div>
 </section></div>;
}
