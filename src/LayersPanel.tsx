import type {Project} from './model';
import {projectClips,clipEnd,clipMedia} from './editing';
import {toggleTrack,videoTrack} from './trackControls';
import Icon from './Icons';
export default function LayersPanel({project,time,selectedId,locked,onSelect,onCaptions,onChange}:{project:Project;time:number;selectedId:string;locked:boolean;onSelect:(id:string)=>void;onCaptions:()=>void;onChange:(p:Project)=>void}){
 const clips=projectClips(project).filter(c=>c.kind!=='audio').sort((a,b)=>(b.track??0)-(a.track??0)||a.start-b.start);
 return <div className="layers-panel"><p className="eyebrow">WARSTWY OBRAZU</p>
  <div className="layer-row"><button className="layer-name" onClick={onCaptions}><Icon name="captions" size={15}/><b>T</b><span>Napisy</span></button><button disabled={locked} aria-label="Widoczność warstwy napisów" aria-pressed={!project.tracks.T?.hidden} onClick={()=>onChange(toggleTrack(project,'T','hidden'))}><Icon name={project.tracks.T?.hidden?'eyeOff':'eye'} size={15}/></button></div>
  {clips.map(c=><div key={c.id} className={`layer-row ${c.id===selectedId?'selected':''} ${c.start<=time&&time<clipEnd(c)?'active':'inactive'}`}><button className="layer-name" disabled={locked} onClick={()=>onSelect(c.id)} title={clipMedia(project,c)?.name}><Icon name="video" size={15}/><b>{videoTrack(c)}</b><span>{clipMedia(project,c)?.name}</span></button><button disabled={locked} aria-label={`Widoczność ${clipMedia(project,c)?.name}`} aria-pressed={!project.tracks[videoTrack(c)]?.hidden} onClick={()=>onChange(toggleTrack(project,videoTrack(c),'hidden'))}><Icon name={project.tracks[videoTrack(c)]?.hidden?'eyeOff':'eye'} size={15}/></button></div>)}
  {!clips.length&&<p className="hint">Dodaj film na oś czasu, aby ustawić jego kadr.</p>}
  <details className="future-layers"><summary>Dodaj warstwę</summary><div>{['Tekst','Nakładka graficzna','Naklejka','Animacja'].map(name=><button key={name} disabled>{name}<small>Wkrótce</small></button>)}</div></details>
 </div>;
}
