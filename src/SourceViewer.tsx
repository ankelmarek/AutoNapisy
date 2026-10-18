import {useEffect,useMemo,useRef,type MutableRefObject} from 'react';
import {formatTime} from './model';
import {markRange,sourceProject,SOURCE_RANGE_TYPE,type SourceItem,type SourceRange} from './sourceSelection';
import {useMltPlayback} from './useMltPlayback';
import Icon from './Icons';
export default function SourceViewer({item,range,proxyRevision,keyHandler,locked,onRange,onAdd,onClose}:{item:SourceItem;range:SourceRange;proxyRevision:string;keyHandler:MutableRefObject<((e:KeyboardEvent)=>void)|null>;locked:boolean;onRange:(r:SourceRange)=>void;onAdd:(r:SourceRange)=>void;onClose:()=>void}){
 const project=useMemo(()=>sourceProject(item),[item.id,item.path,item.duration]),player=useMltPlayback(project,proxyRevision);
 const host=useRef<HTMLDivElement>(null),latest=useRef({player,range,locked});latest.current={player,range,locked};
 const mark=(edge:'in'|'out')=>onRange(markRange(range,edge,player.time,item.duration!));
 const timecode=(n:number)=>`${formatTime(n)}.${Math.floor(n%1*1000).toString().padStart(3,'0')}`;
 useEffect(()=>{host.current?.focus();return()=>latest.current.player.pause();},[]);
 useEffect(()=>{if(locked)player.pause();},[locked]);
 const key=(e:React.KeyboardEvent|KeyboardEvent)=>{
  if(e.ctrlKey||e.metaKey)return;e.stopPropagation();if(locked)return;
  const el=e.target as HTMLElement,text=el.isContentEditable||el.tagName==='TEXTAREA'||(el.tagName==='INPUT'&&['text','search'].includes((el as HTMLInputElement).type));if(e.code==='Space'&&!text){e.preventDefault();player.toggle();return;}if(text||['INPUT','SELECT'].includes(el.tagName))return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.code==='Space'){e.preventDefault();player.toggle();}
  else if(e.key.toLowerCase()==='i'){e.preventDefault();mark('in');}
  else if(e.key.toLowerCase()==='o'){e.preventDefault();mark('out');}
  else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();player.pause();player.seek(player.time+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?1:1/30));}
  else if(e.key==='Home'){e.preventDefault();player.seek(0);}
  else if(e.key==='End'){e.preventDefault();player.seek(item.duration!);}
  else if(e.key==='Escape'){e.preventDefault();onClose();}
 };
 keyHandler.current=key;
 return <div className="source-viewer" ref={host} tabIndex={-1} onKeyDown={key} role="region" aria-label="Podgląd pliku źródłowego">
  <div className="source-heading"><span><Icon name="video" size={14}/> Źródło · {item.name}</span><button className="icon-button" aria-label="Wróć do montażu" title="Wróć do montażu (Esc)" onClick={onClose}><Icon name="x" size={15}/></button></div>
  <div className="source-stage"><video ref={player.video} playsInline preload="auto"/>{player.loading&&<span className="transition-preparing">Przygotowywanie źródła…</span>}{player.error&&<div className="preview-error" role="alert"><p>{player.error}</p><button onClick={player.retry}>Ponów podgląd źródła</button></div>}{item.kind==='audio'&&<Icon name="audio" size={45}/>}</div>
  <div className="source-scrub"><div className="source-range-band" style={{left:`${range.sourceIn/item.duration!*100}%`,width:`${(range.sourceOut-range.sourceIn)/item.duration!*100}%`}}/><input aria-label="Pozycja w źródle" type="range" min={0} max={item.duration!} step={1/30} value={player.time} disabled={locked} onChange={e=>{player.pause();player.seek(Number(e.target.value));}}/></div>
  <div className="source-transport"><button className="icon-button" aria-label={player.playing?'Wstrzymaj źródło':'Odtwórz źródło'} disabled={locked} onClick={player.toggle}><Icon name={player.playing?'pause':'play'} size={18}/></button><code>{timecode(player.time)} / {timecode(item.duration!)}</code></div>
  <div className="source-marks"><label><button disabled={locked} onClick={()=>mark('in')} title="Ustaw początek w pozycji głowicy (I)">I · Początek</button><input aria-label="Początek zakresu źródła" type="number" min={0} max={range.sourceOut-.05} step={1/30} value={Number(range.sourceIn.toFixed(3))} disabled={locked} onChange={e=>onRange(markRange(range,'in',e.currentTarget.valueAsNumber,item.duration!))}/></label><label><button disabled={locked} onClick={()=>mark('out')} title="Ustaw koniec w pozycji głowicy (O)">O · Koniec</button><input aria-label="Koniec zakresu źródła" type="number" min={range.sourceIn+.05} max={item.duration!} step={1/30} value={Number(range.sourceOut.toFixed(3))} disabled={locked} onChange={e=>onRange(markRange(range,'out',e.currentTarget.valueAsNumber,item.duration!))}/></label><button className="icon-button" title="Zaznacz całe źródło" aria-label="Zaznacz całe źródło" disabled={locked} onClick={()=>onRange({sourceIn:0,sourceOut:item.duration!})}><Icon name="undo" size={16}/></button></div>
  <div className="source-insert"><span>Długość: <b>{(range.sourceOut-range.sourceIn).toFixed(3)} s</b></span><button disabled={locked} draggable={!locked} onDragStart={e=>{player.pause();e.dataTransfer.setData('application/x-rolvixa-media',item.id);e.dataTransfer.setData(SOURCE_RANGE_TYPE,JSON.stringify({id:item.id,...range}));e.dataTransfer.effectAllowed='copy';}} onClick={()=>{player.pause();onAdd(range);}}><Icon name="add" size={15}/> Dodaj zaznaczony fragment</button></div><small className="source-hint">I / O · wybierz zakres · przeciągnij przycisk na ścieżkę</small>
 </div>;
}
