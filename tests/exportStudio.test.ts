import {describe,it,expect} from 'vitest';
import {newProject,serializeProject} from '../src/model';
import {defaultExport,exportProfiles,exportOptionsSchema,exportWarnings,estimatedSize,studioActive} from '../src/exportStudio';
describe('Export Studio',()=>{
 it('profile domyślne są poprawne i nie obiecują innego FPS/kodeka',()=>{for(const p of exportProfiles)expect(exportOptionsSchema.safeParse(p.options).success).toBe(true);expect(exportProfiles.find(p=>p.id==='archive')!.options.width).toBeNull();});
 it.each([{width:1081,height:1920},{width:null,height:720},{speed:'cmd.exe'},{crf:0},{audioKbps:777},{captions:'api'},{width:NaN,height:1080}])('odrzuca nieobsługiwane ustawienie %j',patch=>expect(exportOptionsSchema.safeParse({...defaultExport,...patch}).success).toBe(false));
 it('ostrzeżenie o przycięciu lub pasach nie zmienia projektu',()=>{const p=newProject(),json=JSON.stringify(p),opts={...defaultExport,width:1080,height:1920};expect(exportWarnings(p,opts,{width:1920,height:1080}).join()).toContain('pasami');expect(exportWarnings(p,{...opts,fit:'crop'},{width:1920,height:1080}).join()).toContain('przycięty');expect(JSON.stringify(p)).toBe(json);});
 it('uprzedza o upscale i nie nazywa go poprawą jakości',()=>expect(exportWarnings(newProject(),{...defaultExport,width:3840,height:2160},{width:1920,height:1080}).join()).toContain('nie doda szczegółów'));
 it('podaje szeroki szacunek zależny od jakości, czasu i audio',()=>{const size={width:1920,height:1080},a=estimatedSize(defaultExport,size,10),b=estimatedSize(defaultExport,size,20),c=estimatedSize({...defaultExport,crf:30},size,10);expect(a.high).toBeGreaterThan(a.low*2);expect(b.high).toBeCloseTo(a.high*2);expect(c.high).toBeLessThan(a.high);});
 it('kolejka rozróżnia aktywne zadania i ukończenie/błąd',()=>{for(const s of ['preparing','queued','rendering','cancelling'])expect(studioActive(s)).toBe(true);for(const s of ['completed','cancelled','failed'])expect(studioActive(s)).toBe(false);});
});
