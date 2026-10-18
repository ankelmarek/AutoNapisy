import {useEffect,useRef,type ReactNode} from 'react';
/** The native top layer keeps the preview, menus and transition popups underneath. */
export default function TaskDialog({title,busy,onClose,children}:{title:string;busy:boolean;onClose:()=>void;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const previous=document.activeElement,d=dialog.current!;d.showModal();return()=>{d.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 return <dialog ref={dialog} className="source-task-dialog" aria-label={title} aria-modal="true" onCancel={e=>{e.preventDefault();if(!busy)close.current();}} onKeyDown={e=>e.stopPropagation()}><div className="panelhead"><h2>{title}</h2><button aria-label="Zamknij okno" disabled={busy} onClick={onClose}>Zamknij</button></div>{children}</dialog>;
}
