import {useEffect,useMemo,useRef,useState} from 'react';
import type {Project} from './model';
import {compositionSegments} from './editing';
import {synchronizedWords} from './captionAnimation';
import {animatedPresets,presetStyle,applyCaptionStyle,type AnimatedPresetId} from './captionPresets';
import {createAnimatedCaptionRenderer} from './animatedCaptionCanvas';
import {yellowPreset,type CaptionStyle, type CaptionCard} from './captions';
import Icon from './Icons';

// Deliberate example text for the gallery, never inserted as a user transcription.
const demo:CaptionCard={id:'gallery-demo',text:'Twoja historia ma znaczenie',start:0,end:3.2,styleId:'demo',words:[{text:'Twoja',start:.15,end:.7},{text:'historia',start:.8,end:1.4},{text:'ma',start:1.5,end:1.95},{text:'znaczenie',start:2.05,end:2.9}]};
function PresetCanvas({style,active}:{style:CaptionStyle;active:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null);const [ready,setReady]=useState(0);
 useEffect(()=>{let alive=true;void document.fonts.load(`24px "${style.fontFamily}"`).then(()=>{if(alive)setReady(n=>n+1);});return()=>{alive=false;};},[style.fontFamily]);
 useEffect(()=>{if(!canvas.current)return;const draw=createAnimatedCaptionRenderer(canvas.current),s={...style,position:'center' as const,marginPercent:4,boxWidth:90};let frame=0,last=-1;const start=performance.now();
  const render=(time:number)=>{const f=Math.floor(time*30);if(f!==last){last=f;draw(demo,s,time);}};
  if(active){const tick=(now:number)=>{render((now-start)/1000%3.2);frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);}else render(1.1);
  return()=>cancelAnimationFrame(frame);
 },[style,active,ready]);
 return <canvas ref={canvas} width={300} height={168} aria-hidden="true" data-demo-active={active}/>;
}
export default function CaptionStyleInspector({project,selectedId,visible,locked,onChange}:{project:Project;selectedId:string;visible:boolean;locked:boolean;onChange:(p:Project)=>void}){
 const segments=useMemo(()=>compositionSegments(project),[project]),selected=segments.find(s=>s.id===selectedId);
 const [scope,setScope]=useState<'all'|'selected'>(selected?'selected':'all'),[draft,setDraft]=useState<CaptionStyle>(selected?project.styles[selected.styleId]:project.styles.default),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[active,setActive]=useState<AnimatedPresetId|null>(null),[demos,setDemos]=useState(true),[reduced,setReduced]=useState(false),[pageHidden,setPageHidden]=useState(document.hidden),[intersecting,setIntersecting]=useState(true);
 const gallery=useRef<HTMLDivElement>(null),targets=scope==='all'?segments:selected?[selected]:[],actual=targets[0]?project.styles[targets[0].styleId]:project.styles.default,actualKey=JSON.stringify(actual),lastSelection=useRef(selectedId);
 useEffect(()=>{if(lastSelection.current!==selectedId){lastSelection.current=selectedId;if(selected){setScope('selected');setDraft(project.styles[selected.styleId]);setDirty(false);}}},[selectedId,selected,project.styles]);
 useEffect(()=>{if(!dirty)setDraft(actual);},[actualKey,dirty]);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(media.matches),visibility=()=>setPageHidden(document.hidden);update();media.addEventListener('change',update);document.addEventListener('visibilitychange',visibility);return()=>{media.removeEventListener('change',update);document.removeEventListener('visibilitychange',visibility);};},[]);
 useEffect(()=>{if(!gallery.current)return;const o=new IntersectionObserver(([entry])=>setIntersecting(entry.isIntersecting));o.observe(gallery.current);return()=>o.disconnect();},[]);
 useEffect(()=>{if(!visible)setActive(null);},[visible]);
 const disabled=locked||!!project.tracks.T?.locked,canAnimate=visible&&!disabled&&intersecting&&!pageHidden&&!reduced&&demos;
 const update=(patch:Partial<CaptionStyle>)=>{setDraft(s=>({...s,...patch}));setDirty(true);setError('');};
 const animation=(patch:Partial<NonNullable<CaptionStyle['animation']>>)=>{if(draft.animation)update({animation:{...draft.animation,...patch}});};
 const apply=()=>{try{onChange(applyCaptionStyle(project,draft,scope==='all'?null:targets.map(s=>s.id)));setDirty(false);setError('');}catch(e){setError(String(e));}};
 const fallback=draft.animation?targets.filter(s=>!synchronizedWords(s,draft)).length:0;
 return <section className="caption-style-inspector" aria-label="Style napisów">
  <div className="caption-style-heading"><h3>Style napisów</h3><label><input type="checkbox" aria-label="Animuj podglądy stylów" checked={demos&&!reduced} disabled={reduced} onChange={e=>setDemos(e.target.checked)}/> Podglądy</label></div>
  <label>Zastosuj do<select aria-label="Zakres stylu napisów" value={scope} onChange={e=>setScope(e.target.value as typeof scope)} disabled={disabled}><option value="all">Cały montaż · {segments.length} napisów</option><option value="selected" disabled={!selected}>Zaznaczony napis{selected?` · ${selected.start.toFixed(2)}–${selected.end.toFixed(2)} s`:''}</option></select></label>
  <div ref={gallery} className="animated-caption-gallery" role="group" aria-label="Galeria animowanych stylów">
   {animatedPresets.map(p=>{const chosen=draft.animation?.preset===p.id,s=chosen?draft:presetStyle(project.styles.default,p.id);return <button type="button" key={p.id} data-caption-preset={p.id} aria-label={`${p.name}: ${p.description}`} aria-pressed={chosen} disabled={disabled} title={p.description} onMouseEnter={()=>setActive(p.id)} onMouseLeave={e=>{if(document.activeElement!==e.currentTarget)setActive(null);}} onFocus={()=>setActive(p.id)} onBlur={()=>setActive(null)} onClick={()=>{setDraft(presetStyle(draft,p.id));setDirty(true);setError('');}}>
    <PresetCanvas style={s} active={canAnimate&&active===p.id}/><span>{p.name}{chosen&&<Icon name="check" size={14}/>}</span>
   </button>;})}
  </div>
  {reduced&&<small>Podglądy nieruchome zgodnie z ustawieniem ograniczonego ruchu.</small>}
  <div className="caption-static-presets">{[{name:"Żółta plansza",color:"#080808",background:"#ffe600",effect:"box" as const,outlineWidth:0},{name:"Biały obrys",color:"#ffffff",background:"#000000",effect:"outline" as const,outlineWidth:3},{name:"Zielone podświetlenie",color:"#10140c",background:"#b4ff58",effect:"highlight" as const,outlineWidth:0},{name:"Fioletowe podświetlenie",color:"#ffffff",background:"#742cff",effect:"highlight" as const,outlineWidth:1}].map(({name,...style})=><button key={name} disabled={disabled} onClick={()=>update({...style,outlineColor:"#080808",animation:undefined})}>{name}</button>)}</div>
  <button className="caption-static-choice" aria-pressed={!draft.animation} disabled={disabled} onClick={()=>update({animation:undefined})}>Bez animacji</button>
  <fieldset disabled={disabled} className="style-fields">
   {draft.animation&&<><label>Kolor akcentu<input aria-label="Kolor akcentu napisów" type="color" value={draft.animation.accentColor} onChange={e=>animation({accentColor:e.target.value})}/></label><label>Tempo efektu <b>{draft.animation.speed.toFixed(1)}×</b><input aria-label="Tempo animacji napisów" disabled={draft.animation.preset==='karaoke-flow'} type="range" min={.5} max={2} step={.1} value={draft.animation.speed} onChange={e=>animation({speed:Number(e.target.value)})}/></label><label>Intensywność <b>{Math.round(draft.animation.intensity*100)}%</b><input aria-label="Intensywność animacji napisów" type="range" min={0} max={1} step={.05} value={draft.animation.intensity} onChange={e=>animation({intensity:Number(e.target.value)})}/></label></>}
   <label>Krój pisma<select aria-label="Krój pisma napisów" value={draft.fontFamily} onChange={e=>update({fontFamily:e.target.value})}>{['Bebas Neue','Arial','Segoe UI','Georgia'].map(f=><option key={f}>{f}</option>)}</select></label>
   <label>Rozmiar <b>{draft.fontSize}</b><input aria-label="Rozmiar napisów" type="range" min={12} max={100} value={draft.fontSize} onChange={e=>update({fontSize:Number(e.target.value)})}/></label>
   <div className="caption-style-colors"><label>Tekst<input aria-label="Kolor tekstu napisów" type="color" value={draft.color} onChange={e=>update({color:e.target.value})}/></label><label>Tło<input aria-label="Tło napisów" type="color" value={draft.background} onChange={e=>update({background:e.target.value})}/></label><label>Obrys<input aria-label="Kolor obrysu" type="color" value={draft.outlineColor??'#080808'} onChange={e=>update({outlineColor:e.target.value})}/></label></div>
   <label>Wygląd<select aria-label="Wygląd napisów" value={draft.effect??'box'} onChange={e=>update({effect:e.target.value as CaptionStyle['effect']})}><option value="outline">Obrys / przezroczyste tło</option><option value="box">Plansza</option><option value="highlight">Podświetlenie</option></select></label>
   <label>Grubość obrysu <b>{draft.outlineWidth??0}</b><input aria-label="Grubość obrysu" type="range" min={0} max={8} step={.5} value={draft.outlineWidth??0} onChange={e=>update({outlineWidth:Number(e.target.value)})}/></label>
   <label>Pozycja<select aria-label="Pozycja napisów" value={draft.position} onChange={e=>update({position:e.target.value as CaptionStyle['position']})}><option value="bottom">Na dole</option><option value="center">Pośrodku</option><option value="top">Na górze</option></select></label>
   <label>Odstęp od krawędzi <b>{draft.marginPercent}%</b><input aria-label="Margines napisów" type="range" min={0} max={30} value={draft.marginPercent} onChange={e=>update({marginPercent:Number(e.target.value)})}/></label>
   <label><input type="checkbox" checked={draft.uppercase} onChange={e=>update({uppercase:e.target.checked})}/> WIELKIE LITERY</label>
   <details><summary>Łamanie i plansza</summary><label>Maksymalnie linii<select aria-label="Liczba linii napisów" value={draft.maxLines} onChange={e=>update({maxLines:Number(e.target.value)})}>{[1,2,3].map(n=><option key={n}>{n}</option>)}</select></label><label>Znaki na linię<input aria-label="Znaki na linię" type="range" min={12} max={48} value={draft.charsPerLine} onChange={e=>update({charsPerLine:Number(e.target.value)})}/></label><label>Słowa na planszę<input aria-label="Słowa na planszę" type="range" min={3} max={16} value={draft.wordsPerCard} onChange={e=>update({wordsPerCard:Number(e.target.value)})}/></label><label>Szerokość planszy<input aria-label="Szerokość planszy" type="range" min={40} max={95} value={draft.boxWidth} onChange={e=>update({boxWidth:Number(e.target.value)})}/></label><label>Zaokrąglenie<input aria-label="Zaokrąglenie planszy" type="range" min={0} max={60} value={draft.cornerRadius} onChange={e=>update({cornerRadius:Number(e.target.value)})}/></label><button onClick={()=>update({...yellowPreset,effect:'box',outlineWidth:0,animation:undefined})}>Żółta plansza · Bebas Neue</button></details>
  </fieldset>
  {fallback>0&&<p className="caption-sync-note" role="status">Brak synchronizacji słów — użyto animacji planszy ({fallback} napisów).</p>}
  {disabled&&<p className="hint">Odblokuj ścieżkę napisów, aby zmienić styl.</p>}{error&&<p role="alert" className="error">{error}</p>}
  <div className="caption-style-apply"><button className="primary" disabled={disabled||!dirty||(scope==='selected'&&!targets.length)} onClick={apply}><Icon name="check" size={16}/> Zastosuj styl{targets.length?` (${targets.length})`:''}</button>{dirty&&<button onClick={()=>{setDraft(actual);setDirty(false);setError('');}}>Cofnij podgląd</button>}</div>
 </section>;
}
