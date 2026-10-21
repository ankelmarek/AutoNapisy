import {legacyFixture} from './legacyFixture';
import {describe,it,expect} from 'vitest';
import {newProject,parseProject,serializeProject,applyTimelineTranscript} from '../src/model';
import {toggleTrack,clipMuted,videoHidden} from '../src/trackControls';
import {compositionProject,compositionSegments,editDuration,type Clip} from '../src/editing';
import {visuals} from '../src/effects';
const lower:Clip={id:'lower',start:0,sourceIn:0,sourceOut:5,track:0};
const upper:Clip={id:'upper',start:0,sourceIn:0,sourceOut:5,track:1};
const independent:Clip={id:'music',start:0,sourceIn:0,sourceOut:5,track:0,kind:'audio'};
function project(){return {...newProject(),media:{path:'C:/Łódź/film.mp4',name:'Film',duration:5},clips:[lower,upper,independent]};}
describe('sterowanie ścieżkami',()=>{
 it('napisy źródeł śledzą rzeczywistą kolejność i oczko warstw także po przestawieniu V1 nad V2',()=>{const p={...project(),segments:[{id:'source',start:1,end:2,text:'Łódź',words:[],styleId:'default'}]};expect(compositionSegments(p).map(s=>s.clipId)).toEqual(['upper']);p.trackLayout=[...p.trackLayout.filter(t=>t.kind==='video').reverse(),...p.trackLayout.filter(t=>t.kind==='audio')];expect(compositionSegments(p).map(s=>s.clipId)).toEqual(['lower']);expect(compositionSegments(toggleTrack(p,'V1','hidden')).map(s=>s.clipId)).toEqual(['upper']);expect(compositionSegments(toggleTrack(toggleTrack(p,'V1','hidden'),'V2','hidden'))).toEqual([]);});
 it('oczko odsłania dolną ścieżkę bez usuwania ujęć ani wyciszania',()=>{const p=project(),hidden=toggleTrack(p,'V2','hidden');expect(visuals(p,1)[0].id).toBe('upper');expect(visuals(hidden,1)[0].id).toBe('lower');expect(videoHidden(hidden,upper)).toBe(true);expect(clipMuted(hidden,upper)).toBe(false);expect(hidden.clips).toEqual(p.clips);expect(editDuration(hidden)).toBe(5);expect(visuals(toggleTrack(hidden,'V1','hidden'),1)).toEqual([]);});
 it('wyciszenie wideo nie wycisza niezależnego audio na tej samej ścieżce',()=>{const p=toggleTrack(project(),'V1','muted');expect(clipMuted(p,lower)).toBe(true);expect(clipMuted(p,upper)).toBe(false);expect(clipMuted(p,independent)).toBe(false);expect(videoHidden(p,lower)).toBe(false);});
 it('wyciszenie A1 obejmuje dźwięk połączony i niezależny',()=>{const p=toggleTrack(project(),'A1','muted');expect(clipMuted(p,lower)).toBe(true);expect(clipMuted(p,independent)).toBe(true);expect(clipMuted(p,upper)).toBe(false);});
 it('ukrycie T zachowuje napisy do edycji i usuwa je z obrazu oraz eksportu',()=>{const p=applyTimelineTranscript(project(),[{id:'s',start:1,end:2,text:'Zażółć',words:[],styleId:'default'}]),hidden=toggleTrack(p,'T','hidden');expect(compositionSegments(hidden)).toHaveLength(1);expect(compositionProject(hidden).segments).toEqual([]);expect(compositionProject(toggleTrack(hidden,'T','hidden')).segments).toHaveLength(1);expect(hidden.timelineSegments).toEqual(p.timelineSegments);});
 it('zapis i migracja v6 zachowują napisy montażu, a starsze projekty mają ścieżki włączone',()=>{const p=applyTimelineTranscript(project(),[{id:'s',start:1,end:2,text:'Mowa',words:[],styleId:'default'}]),hidden=toggleTrack(toggleTrack(p,'V1','muted'),'T','hidden');expect(parseProject(serializeProject(hidden)).tracks).toEqual(hidden.tracks);const old={...p,schemaVersion:6} as Record<string,unknown>;delete old.tracks;const loaded=parseProject(JSON.stringify(legacyFixture(old)));expect(loaded.schemaVersion).toBe(18);expect(loaded.tracks).toEqual({});expect(loaded.timelineSegments).toEqual(p.timelineSegments);expect(()=>parseProject(JSON.stringify({...p,tracks:{V3:{muted:true}}}))).toThrow();});
});
