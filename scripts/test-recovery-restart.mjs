import {chromium} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const futurePath=path.join(process.env.ROLVIXA_TEST_RECOVERY,'current.json');
if(process.argv.includes('--seed-future')){
 // Called while the application process is stopped: no active writer owns this file.
 fs.writeFileSync(futurePath,JSON.stringify({version:1,capturedAt:Date.now(),manualPath:null,manualAt:null,project:{schemaVersion:99}}));process.exit(0);
}
const browser=await chromium.connectOverCDP(process.env.ROLVIXA_WEBVIEW_CDP);
const page=browser.contexts()[0].pages().find(p=>!p.url().startsWith('devtools:'))??await browser.contexts()[0].waitForEvent('page');page.setDefaultTimeout(45000);
try{
 await page.waitForURL(/tauri\.localhost|^tauri:/);await page.waitForFunction(()=>!!window.__TAURI_INTERNALS__);
 const persisted=JSON.parse(fs.readFileSync('.tools/caption034-persistent-preset.json','utf8'));const catalog=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('caption_presets'));assert.deepEqual(catalog.entries.find(e=>e.id===persisted.id),persisted,'Own preset did not survive actual Windows process restart');console.log('0.34c own style survived real process restart: OK');
 await page.getByRole('dialog',{name:'Odzyskaj pracę'}).waitFor();assert.equal(await page.locator('.start-screen').count(),0);
 const history=JSON.parse(fs.readFileSync(path.join(process.env.ROLVIXA_TEST_HISTORY,'projects.json'),'utf8'));const id=history.entries[0].id;const rejection=await page.evaluate(async id=>{try{await window.__TAURI_INTERNALS__.invoke('open_recent_project',{id});return '';}catch(e){return String(e);}},id);assert(rejection.includes('odzyskania'),'Pending recovery must reject even a valid recent ID');

 if(process.argv.includes('--future')){
  const future=fs.readFileSync(futurePath,'utf8');assert(await page.getByRole('button',{name:'Odzyskaj',exact:true}).isDisabled());await page.waitForTimeout(1800);assert.equal(fs.readFileSync(futurePath,'utf8'),future);await page.getByRole('button',{name:'Odrzuć kopię',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));assert(!fs.existsSync(futurePath));await page.getByRole('main',{name:'Ekran startowy',exact:true}).getByRole('button',{name:'Nowy projekt',exact:true}).click();
  console.log('Future/corrupt recovery copy at process startup requires explicit discard; no silent overwrite: OK');
 }else{
  assert((await page.getByRole('dialog').textContent()).includes('Przed awarią procesu 0.17'));
  const manual=fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8');await page.getByRole('button',{name:'Odzyskaj',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.header-project-name')?.textContent.includes('Przed awarią procesu 0.17'));assert.equal(await page.locator('.start-screen').count(),0);assert.equal(await page.locator('.header-save').getAttribute('data-save-status'),'dirty');assert.equal(fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8'),manual);await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2);
  await page.reload();await page.getByRole('dialog',{name:'Odzyskaj pracę'}).waitFor();await page.getByRole('button',{name:'Odrzuć kopię',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));await page.getByRole('main',{name:'Ekran startowy',exact:true}).getByRole('button',{name:'Nowy projekt',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.header-project-name')?.disabled);assert.equal(await page.locator('.edit-clip').count(),0);assert.equal(fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8'),manual);
  console.log('Forced Windows process crash, OS recovery-lock release, persisted recovery/MLT, manual-file protection and discard: OK');
 }
 await page.getByRole('button',{name:'Napisy',exact:true}).click();const own=page.getByRole('group',{name:'Moje style',exact:true});await own.getByRole('button',{name:persisted.name,exact:true}).waitFor();await own.scrollIntoViewIfNeeded();await page.screenshot({path:'.tools/caption034-library-restart.png'});
}catch(e){console.log('Restart failure:',await page.locator('body').innerText());throw e;}finally{await page.screenshot({path:'.tools/recovery-restart.png'}).catch(()=>{});await browser.close();}
