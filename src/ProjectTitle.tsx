import {forwardRef,useImperativeHandle,useRef,useState} from 'react';
import Icon from './Icons';
import {normalizedTitle} from './projectSaving';
export type TitleEditor={commit:()=>boolean};
export default forwardRef<TitleEditor,{name:string;disabled:boolean;onChange:(name:string)=>void}>(function ProjectTitle({name,disabled,onChange},ref){
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(name),[error,setError]=useState('');
 const cancelled=useRef(false),input=useRef<HTMLInputElement>(null);
 const commit=()=>{if(!editing||cancelled.current)return true;const value=normalizedTitle(draft);if(!value){setError('Wpisz nazwę od 1 do 200 znaków.');input.current?.focus();return false;}setEditing(false);setError('');if(value!==name)onChange(value);return true;};
 useImperativeHandle(ref,()=>({commit}));
 const begin=()=>{cancelled.current=false;setDraft(name);setError('');setEditing(true);requestAnimationFrame(()=>{input.current?.focus();input.current?.select();});};
 return <div className="project-title">{editing?<input ref={input} className="header-project-name" aria-label="Nazwa projektu" aria-invalid={!!error} value={draft} maxLength={240} disabled={disabled} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();commit();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelled.current=true;setEditing(false);setError('');}}}/>:<button className="header-project-name" title="Zmień nazwę projektu" aria-label={`Zmień nazwę projektu: ${name}`} disabled={disabled} onClick={begin}><span>{name}</span><Icon name="rename" size={15}/></button>}{error&&<span className="title-error" role="alert">{error}</span>}</div>;
});
