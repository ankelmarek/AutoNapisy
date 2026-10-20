import {useLayoutEffect,useImperativeHandle,useState,type Ref,type RefObject} from 'react';
import type {Project} from './model';
import {compositionSegments,type EditedSegment} from './editing';
import {editCaption,resizeCaption,setCaptionTiming,canInheritCaption} from './captionEditing';
import {captionTimingState,captionTimingLabel} from './captionTiming';
export type CaptionEditorHandle={commit:(p:Project)=>Project};
export default function CaptionTextEditor({project,caption,locked,inputRef,handleRef,getProject,onChange}:{project:Project;caption:EditedSegment;locked:boolean;inputRef:RefObject<HTMLTextAreaElement|null>;handleRef:Ref<CaptionEditorHandle>;getProject:()=>Project;onChange:(p:Project)=>void}){
 const [draft,setDraft]=useState(caption.text),[error,setError]=useState('');
 useLayoutEffect(()=>{setDraft(caption.text);setError('');},[caption.text]);
 const dirty=draft!==caption.text,state=captionTimingState(project,caption);
 const commit=(p:Project)=>{
  if(!dirty)return p;if(p.tracks.T?.locked)throw Error('Ścieżka napisów jest zablokowana.');
  const current=compositionSegments(p).find(s=>s.id===caption.id);if(current?.text===draft)return p;if(!current||current.text!==caption.text)throw Error('Napis zmienił się podczas edycji. Otwórz go ponownie.');
  return editCaption(p,current,{text:draft});
 };
 useImperativeHandle(handleRef,()=>({commit}));
 const apply=()=>{if(locked)return;try{const current=getProject(),next=commit(current);if(next!==current)onChange(next);setError('');}catch(e){setError(String(e));}};
 return <div className="caption-editor" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))apply();}}>
  <h3>Edycja zaznaczonego napisu</h3>
  <textarea ref={inputRef} aria-label="Tekst zaznaczonego napisu" value={draft} maxLength={100000} disabled={locked} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setDraft(caption.text);setError('');}else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.stopPropagation();apply();}}}/>
  {dirty&&<div className="caption-text-actions"><button disabled={locked} onClick={apply}>Zapisz tekst</button><button disabled={locked} onClick={()=>{setDraft(caption.text);setError('');}}>Anuluj tekst</button><small>Ctrl+Enter zapisuje · Esc anuluje. Wyjście z edytora zatwierdza tekst.</small></div>}
  <p className={`caption-timing-status ${state}`} role="status" data-timing={state}>{captionTimingLabel(state)}{state==='inherited'&&<small>Czasy odziedziczone z projektu. Korekta nie została ponownie sprawdzona z nagraniem.</small>}{state==='uncertain'&&<small>Brak pewnej zgodności słów i czasów. Efekty słów użyją animacji całej planszy.</small>}</p>
  {!dirty&&<div className="caption-timing-actions">{state!=='board'&&<button disabled={locked} onClick={()=>onChange(setCaptionTiming(project,caption,'board'))}>Animacja całej planszy</button>}{(state==='board'||state==='uncertain')&&canInheritCaption(project,caption)&&<button disabled={locked} onClick={()=>onChange(setCaptionTiming(project,caption,'inherited'))}>Zachowaj czasy 1:1</button>}</div>}
  {error&&<p className="error" role="alert">{error}</p>}
  <div><label>Początek<input aria-label="Początek napisu" type="number" step={.01} value={Number(caption.start.toFixed(3))} disabled={locked||dirty} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))onChange(resizeCaption(project,caption,'left',e.target.valueAsNumber-caption.start));}}/></label><label>Koniec<input aria-label="Koniec napisu" type="number" step={.01} value={Number(caption.end.toFixed(3))} disabled={locked||dirty} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))onChange(resizeCaption(project,caption,'right',e.target.valueAsNumber-caption.end));}}/></label></div>
 </div>;
}
