import {useRef,useEffect} from 'react';
import Icon,{type IconName} from './Icons';
const menuIcons:Record<string,IconName>={Nowy:'new','Otwórz':'open',Zapisz:'save','Importuj filmy':'import','Importuj audio':'audio','Eksport MP4':'export','Eksport SRT':'captions',Ustawienia:'settings'};
export type MenuAction={label:string;keys?:string;run:()=>void;disabled?:boolean};
export default function ProjectMenu({actions}:{actions:MenuAction[]}){
 const menu=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(menu.current?.open&&!menu.current.contains(e.target as Node))menu.current.open=false;};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&menu.current)menu.current.open=false;};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};},[]);
 return <details className="project-menu" ref={menu}><summary>Projekt <Icon name="chevronDown" size={14}/></summary><div className="project-menu-popup">{actions.map(a=><button key={a.label} aria-label={a.label} title={a.keys?`${a.label} (${a.keys})`:a.label} disabled={a.disabled} onClick={()=>{menu.current!.open=false;a.run();}}><Icon name={menuIcons[a.label]??"files"} size={15}/>{a.label}<kbd>{a.keys}</kbd></button>)}</div></details>;
}
