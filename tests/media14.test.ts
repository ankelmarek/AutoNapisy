import {describe,it,expect} from 'vitest';
import {newProject,parseProject,serializeProject} from '../src/model';
import {libraryItems,registerMedia,insertLibraryItem} from '../src/library';
import {proxyLabel,type ProxyRecord} from '../src/useVideoProxies';
describe('biblioteka 0.14',()=>{
 it('znacznik użycia wynika z osi, obsługuje wiele wystąpień i cofnięcie',()=>{
  const original=registerMedia(newProject(),{path:'C:/Łódź.mov',name:'Film',duration:4},'video');
  expect(libraryItems(original)[0].uses).toBe(0);const one=insertLibraryItem(original,'primary',0),two=insertLibraryItem(one,'primary',4);
  expect(libraryItems(two)[0].uses).toBe(2);expect(libraryItems({...two,clips:two.clips!.slice(1)})[0].uses).toBe(1);expect(libraryItems(original)[0].uses).toBe(0);
  expect(libraryItems(parseProject(serializeProject(two)))[0].uses).toBe(2);
 });
 it('odróżnia gotową kopię od faktycznego używania proxy',()=>{
  const r:ProxyRecord={path:'C:/Łódź.mov',status:'ready',profile:540,enabled:true,previewPath:'C:/Cache/video.mp4',progress:100,message:'',recommended:true};
  expect(proxyLabel(r)).toBe('Proxy 540p');expect(proxyLabel({...r,enabled:false,previewPath:null})).toBe('Oryginał · proxy gotowe');expect(proxyLabel({...r,status:'building',progress:37})).toBe('Proxy 37%');expect(proxyLabel({...r,status:'error',previewPath:null})).toBe('Błąd proxy');
 });
});
