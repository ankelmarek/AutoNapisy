import {describe,it,expect} from 'vitest';
import {newProject,parseProject,serializeProject} from '../src/model';
import {splitClip,trimClip,moveClip,closeGaps,compositionSegments,editDuration,clipAt,type Clip} from '../src/editing';
import {synchronization} from '../src/adapters';
import {historyReducer} from '../src/useHistory';
const base:Clip[]=[{id:'a',sourceIn:0,sourceOut:10,start:0}];
const project=()=>({...newProject(),media:{path:'C:/Łódź/a.mp4',name:'a',duration:10},clips:base});
describe('montaż niedestrukcyjny',()=>{
 it('żyletka zachowuje dokładne granice i oryginał',()=>{const out=splitClip(base,'a',4,'b');expect(out).toEqual([{...base[0],sourceOut:4},{id:'b',start:4,sourceIn:4,sourceOut:10}]);expect(base[0].sourceOut).toBe(10);expect(splitClip(base,'a',.01)).toBe(base);});
 it('przycinanie przywraca źródło i nie nachodzi na sąsiada',()=>{let c=splitClip(base,'a',4,'b');c=trimClip(c,'b','left',2,10);expect(c[1]).toMatchObject({start:6,sourceIn:6});c=trimClip(c,'b','left',-20,10);expect(c[1]).toMatchObject({start:4,sourceIn:4});c=trimClip(c,'a','right',50,10);expect(c[0].sourceOut).toBe(4);expect(trimClip(base,'a','right',-100,10)[0].sourceOut).toBeCloseTo(.05);});
 it('przesuwa z magnesem bez nakładania i pozwala zmienić kolejność',()=>{const clips=[{id:'a',start:0,sourceIn:0,sourceOut:2},{id:'b',start:4,sourceIn:4,sourceOut:6}];expect(moveClip(clips,'a',2.05,.1).find(c=>c.id==='a')?.start).toBe(2);const moved=moveClip(clips,'a',6.05,.1);expect(moved.find(c=>c.id==='a')?.start).toBe(6);expect(closeGaps(moved).map(c=>[c.id,c.start])).toEqual([['b',0],['a',2]]);expect(moveClip(clips,'a',4.5,0).every((c,i,all)=>i===0||c.start>=all[i-1].start+2)).toBe(true);});
 it('wycina, przesuwa i powtarza słowa wraz z materiałem',()=>{const p=project();p.clips=[{id:'b',start:1,sourceIn:4,sourceOut:8},{id:'a',start:5,sourceIn:0,sourceOut:2}];p.segments=[{id:'s',text:'raz dwa trzy',start:0,end:7,styleId:'default',words:[{text:'raz',start:0,end:1},{text:'dwa',start:4,end:5},{text:'trzy',start:6,end:7}]}];const out=compositionSegments(p);expect(out.map(s=>[s.text,s.start,s.end])).toEqual([['dwa trzy',1,4],['raz',5,7]]);expect(out[0].words[0]).toEqual({text:'dwa',start:1,end:2});expect(p.segments[0].text).toBe('raz dwa trzy');expect(editDuration(p)).toBe(7);expect(clipAt(p.clips,.5)).toBeUndefined();});
 it('zapisuje montaż v3 i migruje dawny projekt',()=>{const p=project();p.clips=splitClip(base,'a',3,'b');expect(parseProject(serializeProject(p)).clips).toEqual(p.clips);const old={...p,schemaVersion:2} as Record<string,unknown>;delete old.clips;expect(parseProject(JSON.stringify(old)).clips).toEqual([{id:'original',sourceIn:0,sourceOut:10,start:0}]);});
 it('odrzuca nakładanie, brak źródła, nieprawidłowe granice i duplikaty',()=>{const p=project();for(const clips of [[{...base[0],sourceOut:11}],[base[0],{...base[0],id:'b',start:2}],[base[0],{...base[0],start:10}],[{...base[0],sourceIn:5,sourceOut:4}]])expect(()=>serializeProject({...p,clips})).toThrow();expect(()=>serializeProject({...p,media:null})).toThrow();});
 it('usunięcie wszystkich ujęć nie odtwarza automatycznie źródła',()=>{const p={...project(),clips:[]};expect(editDuration(p)).toBe(0);expect(compositionSegments(p)).toEqual([]);expect(parseProject(serializeProject(p)).clips).toEqual([]);});
 it('cofa i ponawia montaż, a nowa zmiana usuwa redo',()=>{const p=project();let state={present:p,past:[],future:[]} as Parameters<typeof historyReducer>[0];state=historyReducer(state,{type:'edit',value:{...p,clips:splitClip(base,'a',3,'b')}});state=historyReducer(state,{type:'undo'});expect(state.present.clips).toEqual(base);state=historyReducer(state,{type:'redo'});expect(state.present.clips).toHaveLength(2);state=historyReducer(state,{type:'undo'});state=historyReducer(state,{type:'edit',value:{...p,name:'zmiana'}});expect(state.future).toEqual([]);});
 it('synchronizacja używa czasu montażu również poza długością źródła',()=>{
  const p=project();p.clips=[{id:'moved',sourceIn:0,sourceOut:2,start:10}];p.segments=[{id:'s',text:'tekst',start:0,end:1,words:[],styleId:'default'}];
  expect(synchronization.activeSegments(p,.5)).toEqual([]);expect(synchronization.activeSegments(p,10.5)[0]).toMatchObject({start:10,end:11});
 });

});
