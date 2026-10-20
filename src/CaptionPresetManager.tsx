import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {presetCatalogSchema,presetNameSchema,type PresetCatalog,type PresetMutation} from './captionPresetLibrary';
import type {CaptionStyle} from './captions';
export function useCaptionPresetLibrary(){
 const [catalog,setCatalog]=useState<PresetCatalog|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),alive=useRef(true),pending=useRef(false),readEpoch=useRef(0);
 const refresh=async()=>{const ticket=++readEpoch.current;try{const c=presetCatalogSchema.parse(await invoke('caption_presets'));if(alive.current&&ticket===readEpoch.current){setCatalog(c);setError('');}return c;}catch(e){if(alive.current&&ticket===readEpoch.current)setError(String(e));throw e;}};
 useEffect(()=>{alive.current=true;void refresh().catch(()=>{});return()=>{alive.current=false;};},[]);
 const mutate=async(operation:PresetMutation)=>{if(!catalog||pending.current)throw Error('Biblioteka nie jest jeszcze dostępna.');pending.current=true;++readEpoch.current;setBusy(true);try{const c=presetCatalogSchema.parse(await invoke('mutate_caption_preset',{revision:catalog.revision,operation}));if(alive.current){setCatalog(c);setError('');}return c;}catch(e){await refresh().catch(()=>{});if(alive.current)setError(String(e));throw e;}finally{pending.current=false;if(alive.current)setBusy(false);}};
 return {catalog,error,busy,refresh,mutate};
}
export type PresetDialogAction={kind:'create';style:CaptionStyle}|{kind:'rename'|'duplicate'|'delete';id:string;name:string};
export function CaptionPresetDialog({action,busy,onSubmit,onClose}:{action:PresetDialogAction;busy:boolean;onSubmit:(operation:PresetMutation)=>Promise<void>;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),[name,setName]=useState(action.kind==='create'?'Mój styl':action.kind==='duplicate'?action.name+' — kopia':action.name),[error,setError]=useState('');
 const title=action.kind==='create'?'Zapisz jako mój styl':action.kind==='rename'?'Zmień nazwę stylu':action.kind==='duplicate'?'Duplikuj styl':'Usuń własny styl';
 useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close();},[]);
 const submit=async()=>{try{let op:PresetMutation;if(action.kind==='delete')op={kind:'delete',id:action.id};else{const n=presetNameSchema.parse(name);op=action.kind==='create'?{kind:'create',name:n,style:action.style}:{kind:action.kind,id:action.id,name:n};}setError('');await onSubmit(op);onClose();}catch(e){setError(String(e));}};
 return <dialog ref={ref} className="caption-preset-dialog" aria-label={title} onKeyDown={e=>e.stopPropagation()} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <form onSubmit={e=>{e.preventDefault();void submit();}}><h2>{title}</h2>{action.kind==='delete'?<p>Usunąć „{action.name}” z biblioteki? Napisy w zapisanych projektach zachowają swój wygląd.</p>:<label>Nazwa stylu<input autoFocus aria-label="Nazwa własnego stylu" value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>}
  {action.kind==='create'&&<p className="hint">Zapisujesz szablon w bibliotece. Napisy zmienisz osobnym przyciskiem Zastosuj.</p>}{error&&<p role="alert" className="error">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>Anuluj</button><button className="primary" disabled={busy} type="submit">{busy?'Zapisywanie…':action.kind==='delete'?'Usuń styl':'Zapisz styl'}</button></footer></form>
 </dialog>;
}
