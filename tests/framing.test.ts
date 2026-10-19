import {legacyFixture} from './legacyFixture';
import {it,expect,describe} from 'vitest';
import {newProject,parseProject,serializeProject} from '../src/model';
import {changeTransform,fillScale,frameRect,identity} from '../src/framing';
import {registerMedia,insertLibraryItem} from '../src/library';
import {splitClip} from '../src/editing';
const project=()=>({...newProject(),media:{path:'C:/Łódź.mp4',name:'film',duration:4},clips:[{id:'a',start:0,sourceIn:0,sourceOut:4}]});
describe('kadr filmu',()=>{
 it('skala jest liczona od środka, przesunięcie od wymiarów obszaru',()=>{expect(frameRect(128,192,{scale:3,x:.5,y:0})).toEqual({left:-64,top:-192,width:384,height:576});expect(frameRect(128,192,identity)).toEqual({left:0,top:0,width:128,height:192});});
 it('wypełnienie kadru pionowego zachowuje proporcje',()=>{expect(fillScale(16/9,9/16)).toBeCloseTo(256/81);expect(fillScale(9/16,16/9)).toBeCloseTo(256/81);});
 it('zapisuje format i niezależny kadr klipu, cięcie je zachowuje',()=>{const p=changeTransform({...project(),canvas:{width:1080,height:1920}},'a',{scale:2,x:.2,y:-.3});const loaded=parseProject(serializeProject(p));expect(loaded.canvas).toEqual({width:1080,height:1920});expect(loaded.clips![0].transform).toEqual({scale:2,x:.2,y:-.3});expect(splitClip(loaded.clips!,'a',2,'b').map(c=>c.transform)).toEqual([loaded.clips![0].transform,loaded.clips![0].transform]);});
 it('odrzuca wadliwe i nadmierne przekształcenia',()=>{for(const transform of [{scale:0,x:0,y:0},{scale:5,x:0,y:0},{scale:1,x:3,y:0}])expect(()=>serializeProject({...project(),clips:[{...project().clips[0],transform}]})).toThrow();expect(()=>serializeProject({...project(),canvas:{width:1081,height:1920}})).toThrow();});
 it('migracja v7 zachowuje ścieżki i napisy, nowy kadr pozostaje neutralny',()=>{const p={...project(),schemaVersion:7,tracks:{V1:{muted:true}},timelineSegments:[{id:'s',start:0,end:1,text:'Mowa',words:[],styleId:'default'}]} as Record<string,unknown>;delete p.canvas;const v=parseProject(JSON.stringify(legacyFixture(p)));expect(v.schemaVersion).toBe(14);expect(v.tracks.V1?.muted).toBe(true);expect(v.timelineSegments).toEqual(p.timelineSegments);expect(v.clips![0].transform).toBeUndefined();});
});

it('biblioteka zachowuje autorstwo i licencję po dodaniu audio, cięciu i ponownym otwarciu',()=>{
 const provenance={provider:'openverse' as const,externalId:'8624ba61-57f1-4f98-8a85-ece206c319cf',title:'Utwór',creator:'Żaneta',license:'by',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',sourceUrl:'https://example.org/utwor',attribution:'Utwór — Żaneta, CC BY 4.0'};
 const p=registerMedia(newProject(),{path:'C:/Dźwięki/utwór.wav',name:'Utwór',duration:4,provenance},'audio');
 const timeline=insertLibraryItem(p,p.assets[0].id,1,1);const loaded=parseProject(serializeProject({...timeline,clips:splitClip(timeline.clips!,timeline.clips![0].id,3,'cut')}));
 expect(loaded.assets[0].provenance).toEqual(provenance);expect(loaded.clips).toHaveLength(2);expect(loaded.clips!.every(c=>c.assetId===p.assets[0].id&&c.track===1)).toBe(true);
});
