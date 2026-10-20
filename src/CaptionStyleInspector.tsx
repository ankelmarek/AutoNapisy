import {mixedCaptionStyles} from './captionSelection';
import {useEffect,useMemo,useRef,useState,useId} from 'react';
import type {Project} from './model';
import {compositionSegments} from './editing';
import {synchronizedWords,hasCaptionMotion} from './captionAnimation';
import {animatedPresets,classicPresets,classicPresetStyle,presetStyle,applyCaptionStyle,visualCaptionPreset,setCaptionAnimation} from './captionPresets';
import type {CaptionStyle} from './captions';
import CaptionPresetPreview from './CaptionPresetPreview';
import Icon from './Icons';

export default function CaptionStyleInspector({project,selectedIds,visible,locked,onChange}:{project:Project;selectedIds:string[];visible:boolean;locked:boolean;onChange:(p:Project)=>void}){
 const segments=useMemo(()=>compositionSegments(project),[project]),selected=useMemo(()=>{const ids=new Set(selectedIds);return segments.filter(s=>ids.has(s.id));},[segments,selectedIds]),selectionKey=JSON.stringify(selectedIds);
 const [scope,setScope]=useState<'all'|'selected'>('selected'),[draft,setDraft]=useState<CaptionStyle>(selected[0]?project.styles[selected[0].styleId]:project.styles.default),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[active,setActive]=useState<string|null>(null),[demos,setDemos]=useState(true),[reduced,setReduced]=useState(false),[pageHidden,setPageHidden]=useState(document.hidden),[intersecting,setIntersecting]=useState(true),[pane,setPane]=useState<'styles'|'options'>('styles');
 const baseStyles=useMemo(()=>Object.fromEntries([...classicPresets.map(p=>[p.id,classicPresetStyle(p.id)]),...animatedPresets.map(p=>[p.id,presetStyle(project.styles.default,p.id)])]),[project.styles.default]);
 const gallery=useRef<HTMLDivElement>(null),tabs=useRef<HTMLDivElement>(null),drafts=useRef(new Map<string,CaptionStyle>()),instance=useId(),targets=scope==='all'?segments:selected,actual=targets[0]?project.styles[targets[0].styleId]:project.styles.default,actualKey=JSON.stringify(actual),lastSelection=useRef(selectionKey),mixed=useMemo(()=>mixedCaptionStyles(targets.map(s=>project.styles[s.styleId])),[targets,project.styles]);
 useEffect(()=>{if(lastSelection.current!==selectionKey){lastSelection.current=selectionKey;drafts.current.clear();setScope('selected');setDraft(selected[0]?project.styles[selected[0].styleId]:project.styles.default);setDirty(false);setError('');}},[selectionKey]);
 useEffect(()=>{if(!dirty){setDraft(actual);drafts.current.clear();}},[actualKey,dirty]);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(media.matches),visibility=()=>setPageHidden(document.hidden);update();media.addEventListener('change',update);document.addEventListener('visibilitychange',visibility);return()=>{media.removeEventListener('change',update);document.removeEventListener('visibilitychange',visibility);};},[]);
 useEffect(()=>{if(!gallery.current){setIntersecting(true);return;}const o=new IntersectionObserver(([entry])=>setIntersecting(entry.isIntersecting));o.observe(gallery.current);return()=>o.disconnect();},[pane]);
 useEffect(()=>{if(!visible)setActive(null);},[visible]);
 const disabled=locked||!!project.tracks.T?.locked,canAnimate=visible&&!disabled&&intersecting&&!pageHidden&&!reduced&&demos,currentId=mixed&&!dirty?null:visualCaptionPreset(draft);
 const update=(patch:Partial<CaptionStyle>)=>{setDraft(s=>{const next={...s,...patch},id=visualCaptionPreset(s);if(id)drafts.current.set(id,next);return next;});setDirty(true);setError('');};
 const animation=(patch:Partial<NonNullable<CaptionStyle['animation']>>)=>{if(draft.animation)update({animation:{...draft.animation,...patch}});};
 const choose=(id:string)=>{if(currentId)drafts.current.set(currentId,draft);setDraft(drafts.current.get(id)??baseStyles[id]);setDirty(true);setError('');};
 const apply=()=>{if(!dirty||(scope==='selected'&&!targets.length))return;try{onChange(applyCaptionStyle(project,draft,scope==='all'?null:targets.map(s=>s.id)));setDirty(false);setError('');drafts.current.clear();}catch(e){setError(String(e));}};
 const fallback=useMemo(()=>hasCaptionMotion(draft)?targets.filter(s=>!synchronizedWords(s,draft)).length:0,[draft,segments,scope,selectionKey]);
 const tile=(p:{id:string;name:string;description:string})=>{const chosen=currentId===p.id,s=chosen?draft:drafts.current.get(p.id)??baseStyles[p.id];return <button type="button" key={p.id} data-caption-preset={p.id} aria-label={p.name} aria-pressed={chosen} disabled={disabled} title={p.description} onMouseEnter={()=>setActive(p.id)} onMouseLeave={e=>{if(document.activeElement!==e.currentTarget)setActive(null);}} onFocus={()=>setActive(p.id)} onBlur={()=>setActive(null)} onClick={()=>choose(p.id)}>
  <CaptionPresetPreview style={s} active={canAnimate&&active===p.id} height={150}/><span>{p.name}{chosen&&<Icon name="check" size={14}/>}</span>
 </button>;};
 return <section className="caption-style-inspector" aria-label="Style napisów">
  <p className="caption-selection-count" role="status">Zaznaczono {selected.length} napisów</p>
  <label>Zastosuj do<select aria-label="Zakres stylu napisów" value={scope} onChange={e=>{setScope(e.target.value as typeof scope);setDirty(false);setError('');drafts.current.clear();}} disabled={disabled}><option value="selected">Zaznaczone ({selected.length})</option><option value="all">Wszystkie ({segments.length})</option></select></label>
  {mixed&&!dirty&&<p className="caption-mixed-note" role="status">Różne style · wybierz kafelek, aby nadać wspólny wygląd.</p>}
  <div className="caption-inspector-tabs" ref={tabs} role="tablist" aria-label="Widok inspektora napisów" onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'styles':e.key==='End'?'options':pane==='styles'?'options':'styles';setPane(next);setActive(null);tabs.current?.querySelector<HTMLButtonElement>(`[data-pane=${next}]`)?.focus();}}>
   {(['styles','options'] as const).map(p=><button key={p} id={`${instance}-${p}-tab`} data-pane={p} role="tab" aria-selected={pane===p} aria-controls={`${instance}-${p}-panel`} tabIndex={pane===p?0:-1} onClick={()=>{setPane(p);setActive(null);}}>{p==='styles'?'Style napisów':'Opcje napisów'}</button>)}
  </div>
  <div id={`${instance}-${pane}-panel`} role="tabpanel" aria-labelledby={`${instance}-${pane}-tab`}>
  {pane==='styles'?<>
   <div className="caption-style-heading"><h3>Galeria stylów</h3><label><input type="checkbox" aria-label="Animuj podglądy stylów" checked={demos&&!reduced} disabled={reduced} onChange={e=>setDemos(e.target.checked)}/> Podglądy</label></div>
   <div ref={gallery} className="caption-preset-groups" role="group" aria-label="Galeria stylów napisów">
    <h4>Klasyczne</h4><div className="caption-preset-grid" role="group" aria-label="Style klasyczne">{classicPresets.map(tile)}</div>
    <h4>Animowane</h4><div className="caption-preset-grid" role="group" aria-label="Galeria animowanych stylów">{animatedPresets.map(tile)}</div>
   </div>
   {reduced&&<small>Podglądy nieruchome zgodnie z ustawieniem ograniczonego ruchu.</small>}
  </>:mixed&&!dirty?<p className="caption-mixed-note">Wybierz wspólny styl w galerii przed zmianą jego opcji. <button type="button" onClick={()=>setPane('styles')}>Wybierz styl</button></p>:<div className="caption-options-layout">
   <div className="caption-options-preview" hidden={mixed&&!dirty}><CaptionPresetPreview style={draft} active={canAnimate} label="Podgląd bieżącego stylu"/><small>Tekst przykładowy · {classicPresets.find(p=>p.id===currentId)?.name??animatedPresets.find(p=>p.id===currentId)?.name??'Styl z projektu'}</small></div>
   <fieldset disabled={disabled||(mixed&&!dirty)} className="style-fields">
    <label>Krój pisma<select aria-label="Krój pisma napisów" value={draft.fontFamily} onChange={e=>update({fontFamily:e.target.value})}>{[...new Set(['Bebas Neue','Arial','Segoe UI','Georgia',draft.fontFamily])].map(f=><option key={f}>{f}</option>)}</select></label>
    <label>Rozmiar <b>{draft.fontSize}</b><input aria-label="Rozmiar napisów" type="range" min={12} max={100} value={draft.fontSize} onChange={e=>update({fontSize:Number(e.target.value)})}/></label>
    <div className="caption-style-colors"><label>Tekst<input aria-label="Kolor tekstu napisów" type="color" value={draft.color} onChange={e=>update({color:e.target.value})}/></label><label>Tło<input aria-label="Tło napisów" type="color" value={draft.background} onChange={e=>update({background:e.target.value})}/></label><label>Obrys<input aria-label="Kolor obrysu" type="color" value={draft.outlineColor??'#080808'} onChange={e=>update({outlineColor:e.target.value})}/></label></div>
    <label>Wygląd<select aria-label="Wygląd napisów" value={draft.effect??'box'} onChange={e=>update({effect:e.target.value as CaptionStyle['effect']})}><option value="outline">Obrys / przezroczyste tło</option><option value="box">Plansza</option><option value="highlight">Podświetlenie</option></select></label>
    <label>Grubość obrysu<input aria-label="Grubość obrysu" type="range" min={0} max={8} value={draft.outlineWidth??0} onChange={e=>update({outlineWidth:Number(e.target.value)})}/></label>
    <label>Pozycja<select aria-label="Pozycja napisów" value={draft.position} onChange={e=>update({position:e.target.value as CaptionStyle['position']})}><option value="bottom">Na dole</option><option value="center">Pośrodku</option><option value="top">Na górze</option></select></label>
    {draft.animation?<>
     <label className="caption-motion-toggle"><input role="switch" aria-label="Animacja napisów" type="checkbox" checked={hasCaptionMotion(draft)} onChange={e=>update(setCaptionAnimation(draft,e.target.checked))}/> Animacja: {hasCaptionMotion(draft)?'włączona':'wyłączona'}</label>
     <label>Kolor akcentu<input aria-label="Kolor akcentu napisów" type="color" value={draft.animation.accentColor} onChange={e=>animation({accentColor:e.target.value})}/></label>
     <label>Tempo efektu <b>{draft.animation.speed.toFixed(1)}×</b><input aria-label="Tempo animacji napisów" disabled={!hasCaptionMotion(draft)||draft.animation.preset==='karaoke-flow'} type="range" min={.5} max={2} step={.1} value={draft.animation.speed} onChange={e=>animation({speed:Number(e.target.value)})}/></label>
     <label>Intensywność <b>{Math.round(draft.animation.intensity*100)}%</b><input aria-label="Intensywność animacji napisów" disabled={!hasCaptionMotion(draft)} type="range" min={0} max={1} step={.05} value={draft.animation.intensity} onChange={e=>animation({intensity:Number(e.target.value)})}/></label>
    </>:<small>Styl klasyczny · bez animacji.</small>}
    <details><summary>Zaawansowane</summary>
     <label>Odstęp od krawędzi <b>{draft.marginPercent}%</b><input aria-label="Margines napisów" type="range" min={0} max={30} value={draft.marginPercent} onChange={e=>update({marginPercent:Number(e.target.value)})}/></label>
     <label><input type="checkbox" checked={draft.uppercase} onChange={e=>update({uppercase:e.target.checked})}/> WIELKIE LITERY</label>
     <label>Maksymalnie linii<select aria-label="Liczba linii napisów" value={draft.maxLines} onChange={e=>update({maxLines:Number(e.target.value)})}>{[1,2,3].map(n=><option key={n}>{n}</option>)}</select></label>
     <label>Znaki na linię<input aria-label="Znaki na linię" type="range" min={12} max={48} value={draft.charsPerLine} onChange={e=>update({charsPerLine:Number(e.target.value)})}/></label>
     <label>Słowa na planszę<input aria-label="Słowa na planszę" type="range" min={3} max={16} value={draft.wordsPerCard} onChange={e=>update({wordsPerCard:Number(e.target.value)})}/></label>
     <label>Szerokość planszy<input aria-label="Szerokość planszy" type="range" min={40} max={95} value={draft.boxWidth} onChange={e=>update({boxWidth:Number(e.target.value)})}/></label>
     <label>Zaokrąglenie<input aria-label="Zaokrąglenie planszy" type="range" min={0} max={60} value={draft.cornerRadius} onChange={e=>update({cornerRadius:Number(e.target.value)})}/></label>
    </details>
   </fieldset>
  </div>}
  </div>
  {fallback>0&&!(mixed&&!dirty)&&<p className="caption-sync-note" role="status">Brak synchronizacji słów — użyto animacji planszy ({fallback} napisów).</p>}
  {disabled&&<p className="hint">Odblokuj ścieżkę napisów, aby zmienić styl.</p>}{error&&<p role="alert" className="error">{error}</p>}
  <div className="caption-style-apply"><button className="primary" disabled={disabled||!dirty||(scope==='selected'&&!targets.length)} onClick={apply}><Icon name="check" size={16}/> {pane==='styles'?'Zastosuj styl':'Zastosuj zmiany'}{targets.length?` (${targets.length})`:''}</button>{dirty&&<button onClick={()=>{setDraft(actual);setDirty(false);setError('');drafts.current.clear();}}>Cofnij podgląd</button>}</div>
 </section>;
}
