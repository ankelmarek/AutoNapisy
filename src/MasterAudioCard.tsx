import type {Project} from './model';
import {normalizationStale} from './masterAudio';
import Icon from './Icons';
export default function MasterAudioCard({project,locked,onMeasure,onReset}:{project:Project;locked:boolean;onMeasure:()=>void;onReset:()=>void}){
 const {gainDb,normalization}=project.masterAudio;
 return <section className="master-audio-card" aria-label="Dźwięk całego filmu"><h3><Icon name="audio" size={17}/> Dźwięk całego filmu</h3><p>Wzmocnienie miksu <b>{gainDb>0?'+':''}{gainDb.toFixed(1)} dB</b></p>{normalization&&<small role="status">Cel: {normalization.targetLufs} LUFS{normalizationStale(project)?' · Montaż się zmienił — zmierz ponownie.':' · Normalizacja zastosowana.'}</small>}<button disabled={locked} onClick={onMeasure}>Zmierz / normalizuj miks</button>{(normalization||gainDb!==0)&&<button disabled={locked} onClick={onReset}>Wyłącz normalizację</button>}</section>;
}
