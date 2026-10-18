import {Children,useEffect,useRef,useState,type CSSProperties,type ReactNode,type PointerEvent} from 'react';
import {defaultLayout,fitLayout,layoutStorageKey,moveSplitter,parseLayout,type SplitAxis,type WorkspaceLayout} from './workspaceLayout';
const names={left:'Szerokość biblioteki',right:'Szerokość właściwości',timeline:'Wysokość osi czasu'};
export default function EditorWorkspace({children}:{children:ReactNode}){
 const [layout,setLayout]=useState(()=>{try{return parseLayout(localStorage.getItem(layoutStorageKey));}catch{return {...defaultLayout};}});
 const [size,setSize]=useState({width:1366,height:650}),[resizing,setResizing]=useState(false);
 const root=useRef<HTMLDivElement>(null),current=useRef(layout);current.current=layout;
 const drag=useRef<{axis:SplitAxis;x:number;y:number;base:WorkspaceLayout;width:number;height:number;target:HTMLElement;pointer:number}|null>(null);
 useEffect(()=>{const el=root.current!;const observer=new ResizeObserver(()=>{setSize({width:el.clientWidth,height:el.clientHeight});});observer.observe(el);return()=>observer.disconnect();},[]);
 const save=(next:WorkspaceLayout)=>{setLayout(next);try{localStorage.setItem(layoutStorageKey,JSON.stringify({version:1,...next}));}catch{/* Session layout remains usable when storage is unavailable. */}};
 const finish=(commit:boolean)=>{const d=drag.current;if(!d)return;drag.current=null;setResizing(false);if(d.target.hasPointerCapture(d.pointer))d.target.releasePointerCapture(d.pointer);if(commit)save(current.current);else setLayout(d.base);};
 useEffect(()=>{const cancel=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();e.stopPropagation();finish(false);}};const blur=()=>finish(false);window.addEventListener('keydown',cancel,true);window.addEventListener('blur',blur);return()=>{window.removeEventListener('keydown',cancel,true);window.removeEventListener('blur',blur);};},[]);
 const start=(axis:SplitAxis,e:PointerEvent<HTMLElement>)=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={axis,x:e.clientX,y:e.clientY,base:current.current,width:size.width,height:size.height,target:e.currentTarget,pointer:e.pointerId};setResizing(true);};
 const move=(e:PointerEvent)=>{const d=drag.current;if(!d)return;e.preventDefault();const delta=d.axis==='timeline'?e.clientY-d.y:e.clientX-d.x;setLayout(moveSplitter(d.base,d.axis,delta,d.width,d.height));};
 const fit=fitLayout(layout,size.width,size.height),compact=size.width<820;
 const separator=(axis:SplitAxis)=>{
  const vertical=axis!=='timeline',min=axis==='left'?240:axis==='right'?260:220,max=vertical?Math.min(fit.usable*.5,fit.usable-(axis==='left'?fit.right:fit.left)-280):Math.max(220,size.height-260);
  return <div className={`workspace-splitter ${vertical?'vertical':'horizontal'}`} role="separator" tabIndex={0} hidden={compact} aria-label={names[axis]} aria-orientation={vertical?'vertical':'horizontal'} aria-valuemin={min} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(fit[axis])} aria-valuetext={`${Math.round(fit[axis])} pikseli`} title={`${names[axis]} · przeciągnij lub użyj strzałek · dwuklik przywraca rozmiar`} onPointerDown={e=>start(axis,e)} onPointerMove={move} onPointerUp={()=>finish(true)} onPointerCancel={()=>finish(false)} onLostPointerCapture={()=>finish(false)} onDoubleClick={()=>save({...current.current,[axis]:defaultLayout[axis]})} onKeyDown={e=>{
   if(drag.current)return;const negative=vertical?'ArrowLeft':'ArrowUp',positive=vertical?'ArrowRight':'ArrowDown';
   if(e.key===negative||e.key===positive){e.preventDefault();e.stopPropagation();save(moveSplitter(current.current,axis,(e.key===negative?-1:1)*(e.shiftKey?40:10),size.width,size.height));}
   else if(e.key==='Home'||e.key==='End'){e.preventDefault();e.stopPropagation();const delta=(e.key==='Home'?-1:1)*(axis==='left'?1:-1)*10000;save(moveSplitter(current.current,axis,delta,size.width,size.height));}
   else if(e.key==='Enter'){e.preventDefault();save({...current.current,[axis]:defaultLayout[axis]});}
  }}><span/></div>;
 };
 const [library,preview,inspector,timeline]=Children.toArray(children);
 return <div ref={root} className={`editor-workspace ${compact?'compact-workspace':''} ${size.height-fit.timeline-10<330?'short-panels':''} ${resizing?'resizing-workspace':''}`} style={{'--timeline-height':`${fit.timeline}px`} as CSSProperties}>
  <main className="workspace-panels" style={compact?undefined:{gridTemplateColumns:`${fit.left}px 10px minmax(280px,1fr) 10px ${fit.right}px`}}>{library}{separator('left')}{preview}{separator('right')}{inspector}</main>
  {separator('timeline')}<div className="workspace-timeline">{timeline}</div>
 </div>;
}
