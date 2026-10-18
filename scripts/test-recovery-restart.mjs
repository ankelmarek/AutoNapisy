import {chromium} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const browser=await chromium.connectOverCDP(process.env.ROLVIXA_WEBVIEW_CDP);
const page=browser.contexts()[0].pages().find(p=>!p.url().startsWith('devtools:'))??await browser.contexts()[0].waitForEvent('page');page.setDefaultTimeout(45000);
try{
 await page.waitForURL(/tauri\.localhost|^tauri:/);await page.getByRole('dialog',{name:'Odzyskaj pracę'}).waitFor();assert((await page.getByRole('dialog').textContent()).includes('Przed awarią procesu 0.17'));
 const manual=fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8');await page.getByRole('button',{name:'Odzyskaj',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.header-project-name')?.textContent.includes('Przed awarią procesu 0.17'));assert.equal(await page.locator('.header-save').getAttribute('data-save-status'),'dirty');assert.equal(fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8'),manual);await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2);
 await page.reload();await page.getByRole('dialog',{name:'Odzyskaj pracę'}).waitFor();await page.getByRole('button',{name:'Odrzuć kopię',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[role=dialog]')&&!document.querySelector('.header-project-name')?.disabled);assert.equal(await page.locator('.edit-clip').count(),0);assert.equal(fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8'),manual);
 // Unknown/newer recovery data is never silently cleared by the older app.
 const futurePath=path.join(process.env.ROLVIXA_TEST_RECOVERY,'current.json');const future=JSON.stringify({version:1,capturedAt:Date.now(),manualPath:null,manualAt:null,project:{schemaVersion:99}});fs.writeFileSync(futurePath,future);
 await page.reload();await page.getByRole('dialog',{name:'Odzyskaj pracę'}).waitFor();assert(await page.getByRole('button',{name:'Odzyskaj',exact:true}).isDisabled());await page.waitForTimeout(1800);assert.equal(fs.readFileSync(futurePath,'utf8'),future);await page.getByRole('button',{name:'Odrzuć kopię',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));assert(!fs.existsSync(futurePath));
 console.log('Future/corrupt recovery copy requires explicit discard; no silent overwrite: OK');
 console.log('Forced Windows process crash, OS recovery-lock release, persisted recovery/MLT, manual-file protection and discard: OK');
}catch(e){console.log('Restart failure:',await page.locator('body').innerText());throw e;}finally{await page.screenshot({path:'.tools/recovery-restart.png'}).catch(()=>{});await browser.close();}
