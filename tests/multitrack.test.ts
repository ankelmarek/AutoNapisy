import {describe,it,expect} from 'vitest';
import {newProject,parseProject,serializeProject} from '../src/model';
import {appendMedia,changeTrack,clipAt,compositionSegments,moveClip,splitClip,trimClip,editDuration,type Clip} from '../src/editing';
const media={path:'C:/Łódź/film.mp4',name:'film',duration:10};
describe('dwie ścieżki obrazu i dźwięku',()=>{
 it('dodaje filmy do V1/V2 bez zastępowania projektu i zapisuje Unicode',()=>{
  let p=appendMedia(newProject(),media,'video',0);p=appendMedia(p,{...media,path:'C:/żółć/drugi.mp4'},'video',2);
  expect(p.clips?.map(c=>c.track)).toEqual([0,1]);expect(p.assets).toHaveLength(1);expect(clipAt(p.clips!,3)?.assetId).toBe(p.assets[0].id);
  expect(parseProject(serializeProject(p))).toMatchObject({schemaVersion:5,assets:p.assets,clips:p.clips});
 });
 it('cięcie/przycinanie/przesuwanie zachowuje powiązany dźwięk, głośność i źródło',()=>{
  const c:Clip={id:'v',sourceIn:0,sourceOut:10,start:0,track:1,volume:.4,assetId:'źródło',kind:'video'};
  let cuts=splitClip([c],'v',4,'b');expect(cuts[1]).toMatchObject({track:1,volume:.4,assetId:'źródło',sourceIn:4});
  cuts=trimClip(cuts,'b','left',1,10);cuts=moveClip(cuts,'b',7,0);expect(cuts.find(c=>c.id==='b')).toMatchObject({start:7,sourceIn:5,volume:.4});
 });
 it('niezależne audio można przesuwać przez inne klipy bez ruszania wideo',()=>{
  let p=appendMedia(newProject(),media,'video',0);p=appendMedia(p,{...media,path:'C:/muzyka.wav',duration:20},'audio',0);
  const audio=p.clips![1],next=moveClip(p.clips!,audio.id,3,0);expect(next.find(c=>c.id===audio.id)?.start).toBe(3);expect(next.find(c=>c.id===p.clips![0].id)?.start).toBe(0);expect(editDuration({...p,clips:next})).toBe(23);
 });
 it('zezwala na nakładanie między V1 i V2, blokuje kolizję na tej samej V',()=>{
  let p=appendMedia(newProject(),media,'video',0);p=appendMedia(p,media,'video',2);
  expect(()=>serializeProject(p)).not.toThrow();expect(changeTrack(p.clips!,p.clips![1].id,0)).toBe(p.clips);
  expect(()=>serializeProject({...p,clips:p.clips!.map(c=>({...c,track:0}))})).toThrow();
 });
 it('napisy V1 znikają pod V2 i wracają po jego końcu',()=>{
  let p=appendMedia(newProject(),media,'video',0);p=appendMedia(p,{...media,duration:2},'video',2);
  p.segments=[{id:'lower',text:'dolny',start:0,end:8,words:[],styleId:'default'}];
  expect(compositionSegments(p).map(s=>[s.start,s.end])).toEqual([[0,2],[4,8]]);
 });
 it('odrzuca nieznane źródła, rodzaje, ścieżki i głośność',()=>{
  const p=appendMedia(newProject(),media,'video',0);
  for(const patch of [{assetId:'missing'},{track:2},{kind:'command'},{volume:2}])expect(()=>parseProject(JSON.stringify({...p,clips:[{...p.clips![0],...patch}]}))).toThrow();
 });
 it('napisy drugiego źródła mają niezależne identyfikatory i czas montażu',()=>{
  let p=appendMedia(newProject(),media,'video',0);p=appendMedia(p,media,'video',2);
  p.assets[0].segments=[{id:'s',text:'drugi',start:0,end:1,words:[],styleId:'default'}];expect(compositionSegments(p)[0]).toMatchObject({text:'drugi',start:2,end:3,assetId:p.assets[0].id});
 });
});
