import {describe,it,expect} from 'vitest';
import {defaultLayout,parseLayout,fitLayout,moveSplitter} from '../src/workspaceLayout';
describe('układ edytora',()=>{
 it('odrzuca uszkodzone lub przyszłe ustawienia i ogranicza wartości',()=>{
  for(const raw of [null,'bad','null','{"version":2,"left":0.4}'])expect(parseLayout(raw)).toEqual(defaultLayout);
  expect(parseLayout('{"version":1,"left":99,"right":-4,"timeline":"900"}')).toEqual({left:.5,right:.1,timeline:360});
 });
 it('chroni minima paneli i miejsce na podgląd przy skrajnych gestach',()=>{
  for(const width of [936,1342,1896])for(const height of [500,620,990])for(const axis of ['left','right','timeline'] as const)for(const delta of [-100000,100000]){
   const l=moveSplitter(defaultLayout,axis,delta,width,height),f=fitLayout(l,width,height);
   expect(f.left).toBeGreaterThanOrEqual(240);expect(f.right).toBeGreaterThanOrEqual(260);
   expect(f.usable-f.left-f.right).toBeGreaterThanOrEqual(279.999);
   expect(f.timeline).toBeGreaterThanOrEqual(220);expect(height-f.timeline-10).toBeGreaterThanOrEqual(250);
  }
 });
 it('kierunki drag odpowiadają krawędziom, zapis jest niezależny od rozdzielczości',()=>{
  const f=fitLayout(defaultLayout,1342,620);
  expect(fitLayout(moveSplitter(defaultLayout,'left',20,1342,620),1342,620).left).toBeCloseTo(f.left+20);
  expect(fitLayout(moveSplitter(defaultLayout,'right',20,1342,620),1342,620).right).toBeCloseTo(f.right-20);
  expect(fitLayout(moveSplitter(defaultLayout,'timeline',20,1342,620),1342,620).timeline).toBeCloseTo(f.timeline-20);
  const layout=moveSplitter(defaultLayout,'left',40,1342,620),restored=parseLayout(JSON.stringify({version:1,...layout}));
  expect(restored).toEqual(layout);const full=fitLayout(restored,1896,990);expect(full.left/full.usable).toBeCloseTo(layout.left);expect(defaultLayout).toEqual({left:.31,right:.31,timeline:360});
 });
});
