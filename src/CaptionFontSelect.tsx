import {useEffect,useState} from 'react';
import {captionFontChoices,inspectCaptionFont,fontFallbackMessage,type CaptionFontStatus,CAPTION_FALLBACK} from './captionFonts';
export default function CaptionFontSelect({value,onChange}:{value:string;onChange:(family:string)=>void}){
 const [statuses,setStatuses]=useState<Record<string,CaptionFontStatus>>({});
 useEffect(()=>{let alive=true;void Promise.all([...new Set([...captionFontChoices,value])].map(inspectCaptionFont)).then(rows=>{if(alive)setStatuses(Object.fromEntries(rows.map(s=>[s.family,s])));});return()=>{alive=false;};},[value]);
 const current=statuses[value];return <><label>Krój pisma<select aria-label="Krój pisma napisów" value={value} onChange={e=>onChange(e.target.value)}>{[...new Set([...captionFontChoices,value])].map(f=><option key={f} value={f} disabled={!!statuses[f]&&!statuses[f].available&&f!==value}>{f}{statuses[f]&&!statuses[f].available?' — niedostępny':''}</option>)}</select></label>
 {current&&!current.available&&<p className="caption-font-warning" role="status">{fontFallbackMessage(value)} {value!==CAPTION_FALLBACK&&<button type="button" onClick={()=>onChange(CAPTION_FALLBACK)}>Użyj {CAPTION_FALLBACK}</button>}</p>}</>;
}

export function CaptionFontNotice({family}:{family:string}){
 const [status,setStatus]=useState<CaptionFontStatus|null>(null);
 useEffect(()=>{let alive=true;setStatus(null);void inspectCaptionFont(family).then(s=>{if(alive)setStatus(s);});return()=>{alive=false;};},[family]);
 return status&&!status.available?<p className="caption-font-warning" role="status">{fontFallbackMessage(family)}</p>:null;
}
