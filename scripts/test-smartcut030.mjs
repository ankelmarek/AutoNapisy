import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {smartCut028Fixture} from './smartcut-fixture028.mjs';
export async function testSmartCut030(page,{load,save,read,screenshot,paths}){
 const original=await read(),seed={...smartCut028Fixture(original,paths),name:'SmartCut 0.30 — obraz i przebitka'},mock=await page.evaluate(()=>!!window.__calls);
 const checkpoint=async()=>{await save();await page.waitForFunction(()=>document.querySelector('.header-save')?.dataset.saveStatus==='saved'&&!document.querySelector('.header-save').disabled);return read();};
 const reload=async p=>{await load(p);await page.waitForFunction(name=>document.querySelector('.header-project-name')?.textContent.includes(name)&&!document.querySelector('.header-project-name').disabled,p.name);await checkpoint();};
 await reload(seed);const baseline=await checkpoint(),dialog=page.getByRole('dialog',{name:'SmartCut — porównaj cięcie',exact:true});
 const open=async()=>{await page.locator('[data-clip-id="voice028"]').click({button:'right',position:{x:12,y:12}});await page.getByRole('menuitem',{name:'SmartCut · wytnij zakres',exact:true}).click();await dialog.waitFor();await dialog.getByRole('spinbutton',{name:'Początek wycięcia',exact:true}).fill('0');await dialog.getByRole('spinbutton',{name:'Koniec wycięcia',exact:true}).fill('4');await dialog.getByRole('spinbutton',{name:'Początek wycięcia',exact:true}).fill('2');};
 const ready=async()=>{await page.waitForFunction(()=>document.querySelectorAll('.smartcut-stills img').length===2&&[...document.querySelectorAll('.smartcut-stills img')].every(i=>i.complete&&i.naturalWidth>0));};
 await open();await ready();
 if(!mock)assert(await dialog.locator('.smartcut-stills img').first().evaluate(i=>i.naturalWidth>=128),'Actual MLT-composed PNG, not a placeholder');
 assert(await dialog.getByRole('region',{name:'Obraz przy cięciu'}).isVisible());
 await dialog.getByRole('button',{name:'Granice +1 kl.',exact:true}).click();assert(Math.abs(Number(await dialog.getByRole('spinbutton',{name:'Początek wycięcia',exact:true}).inputValue())-61/30)<.001);
 await dialog.getByRole('button',{name:'Granice −1 kl.',exact:true}).click();await ready();
 await dialog.getByRole('combobox',{name:'Przebitka SmartCut',exact:true}).selectOption('primary');await dialog.getByRole('spinbutton',{name:'Początek źródła przebitki',exact:true}).fill('6');
 await page.waitForFunction(()=>document.querySelector('.smartcut-surface video')?.readyState>=2);await dialog.getByRole('button',{name:'Odtwórz SmartCut',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.smartcut-surface video')?.currentTime>.15);await dialog.getByRole('button',{name:'Wstrzymaj SmartCut',exact:true}).click();
 await dialog.locator('.smartcut-picture').scrollIntoViewIfNeeded();await page.screenshot({path:screenshot});
 assert.deepEqual((await read()).clips,baseline.clips);await dialog.getByRole('button',{name:'Anuluj SmartCut',exact:true}).click();assert.deepEqual((await checkpoint()).clips,baseline.clips);
 // One Apply/Undo includes cutting, mute-only cover picture and retained speech captions.
 await open();await ready();await dialog.getByRole('combobox',{name:'Przebitka SmartCut',exact:true}).selectOption('primary');await dialog.getByRole('spinbutton',{name:'Początek źródła przebitki',exact:true}).fill('6');await dialog.getByRole('button',{name:'Zastosuj cięcie',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const result=await checkpoint(),cover=result.clips.find(c=>c.id.endsWith(':cover'));assert(cover);assert.equal(cover.volume,0);assert.equal(cover.audioRoute,'embedded');assert.equal(cover.sourceIn,6);assert(cover.start<2&&cover.start+cover.sourceOut-cover.sourceIn>2);assert.deepEqual(result.clips.find(c=>c.id==='music028'),baseline.clips.find(c=>c.id==='music028'));assert(result.timelineSegments[0].text.includes('dalsza'));assert(!result.timelineSegments[0].text.includes('usuń'));
 await page.keyboard.press('Control+z');assert.deepEqual((await checkpoint()).clips,baseline.clips);assert.deepEqual((await read()).timelineSegments,baseline.timelineSegments);await page.keyboard.press('Control+y');assert.deepEqual((await checkpoint()).clips,result.clips);await reload({...result,name:'SmartCut 0.30 — ponowne otwarcie'});assert.deepEqual((await read()).clips,result.clips);
 // Invalid ranges block the cover, and selecting none restores the ordinary exact cut.
 await reload({...seed,name:'SmartCut 0.30 — granice źródła'});await open();await dialog.getByRole('combobox',{name:'Przebitka SmartCut',exact:true}).selectOption('primary');await dialog.getByRole('spinbutton',{name:'Początek źródła przebitki',exact:true}).fill('7.8');assert(await dialog.getByRole('button',{name:'Zastosuj cięcie',exact:true}).isDisabled());await dialog.getByRole('combobox',{name:'Przebitka SmartCut',exact:true}).selectOption('');assert(await dialog.getByRole('button',{name:'Zastosuj cięcie',exact:true}).isEnabled());await dialog.getByRole('button',{name:'Anuluj SmartCut',exact:true}).click();
 if(mock){await page.evaluate(()=>window.__smartcutVisualError='Pomiar niedostępny');await open();await page.waitForFunction(()=>document.querySelector('.smartcut-picture')?.textContent.includes('Pomiar niedostępny'));assert(await dialog.getByRole('button',{name:'Zastosuj cięcie',exact:true}).isEnabled());await dialog.getByRole('button',{name:'Anuluj SmartCut',exact:true}).click();await page.evaluate(()=>delete window.__smartcutVisualError);}
 else {
  const invoke=(cmd,args)=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
  const json=JSON.stringify(result),key=randomUUID();const analysis=await invoke('analyze_smartcut_visual',{json,key,at:2});assert.equal(analysis.before.time,59/30);assert(analysis.before.png.length>100);await invoke('validate_smartcut_visual',{json,key});await assert.rejects(invoke('validate_smartcut_visual',{key,json:JSON.stringify({...result,masterAudio:{gainDb:-2}})}),/zmieni/);await invoke('cancel_smartcut',{key});await assert.rejects(invoke('validate_smartcut_visual',{json,key}),/anulowan/i);
  const early=randomUUID();await invoke('cancel_smartcut',{key:early});await assert.rejects(invoke('analyze_smartcut_visual',{json,key:early,at:2}),/anulowan/i);
  await assert.rejects(invoke('analyze_smartcut_visual',{json:JSON.stringify({...result,media:{...result.media,path:result.media.path+'.unauthorized'}}),key:randomUUID(),at:2}));
  const active=randomUUID();const pending=assert.rejects(invoke('analyze_smartcut_visual',{json,key:active,at:2}),/anulowan/i);await invoke('cancel_smartcut',{key:active});await pending;
 }
 await reload(original);await page.locator('.timeline-body').evaluate(el=>el.scrollTop=0);
 console.log('0.30 SmartCut: composed before/after PNG, frame nudge, silent B-roll preview/Cancel/Apply, atomic Undo/Redo/reopen, source bounds, visual fallback/cancellation/authorization: OK');
}
