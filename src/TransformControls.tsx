import type {Project} from './model';
import type {Clip} from './editing';
import {changeTransform,transformOf,identity,fillScale} from './framing';
export default function TransformControls({project,clip,sourceAspect,canvasAspect,locked,onChange}:{project:Project;clip?:Clip;sourceAspect:number;canvasAspect:number;locked:boolean;onChange:(p:Project)=>void}){
 if(!clip||clip.kind==='audio')return null;const t=transformOf(clip),change=(value:Partial<typeof t>)=>onChange(changeTransform(project,clip.id,{...t,...value}));
 return <fieldset className="transform-controls" disabled={locked}><legend>Kadr warstwy</legend>
  <label>Skala <b>{Math.round(t.scale*100)}%</b><input aria-label="Skala filmu" type="range" min={.1} max={4} step={.01} value={t.scale} onChange={e=>change({scale:Number(e.target.value)})}/></label>
  <div className="transform-positions">{(['x','y'] as const).map(axis=><label key={axis}>{axis.toUpperCase()} (%)<input aria-label={`Pozycja filmu ${axis.toUpperCase()}`} type="number" min={-200} max={200} step={1} value={Number((t[axis]*100).toFixed(1))} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))change({[axis]:e.target.valueAsNumber/100});}}/></label>)}</div>
  <div className="transform-actions"><button onClick={()=>onChange(changeTransform(project,clip.id,identity))}>Dopasuj</button><button disabled={sourceAspect<=0} onClick={()=>onChange(changeTransform(project,clip.id,{scale:Math.min(4,fillScale(sourceAspect,canvasAspect)),x:0,y:0}))}>Wypełnij</button><button onClick={()=>change({x:0,y:0})}>Wyśrodkuj</button></div>
  <p className="hint">Zatrzymaj film, aby przesuwać go w podglądzie. Shift ogranicza przesuwanie do jednej osi.</p>
 </fieldset>;
}
