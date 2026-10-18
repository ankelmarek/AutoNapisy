import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const invoke=(page,cmd,args)=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
export async function testSourceAuthorization023(page,projectPath,replacementPath){
 const json=fs.readFileSync(projectPath,'utf8'),template=path.join(path.dirname(projectPath),'replacement-long.mp4');fs.copyFileSync(template,replacementPath);
 const candidate=await invoke(page,'choose_source_replacement',{json,id:'primary'});assert(candidate.info.videoStreams>0);
 await assert.rejects(invoke(page,'prepare_preview',{path:candidate.path}),/Brak uprawnień/,'Selection must not authorize preview before acceptance');
 await assert.rejects(invoke(page,'confirm_source_replacement',{token:candidate.token+99}),/ponownie/);
 fs.writeFileSync(replacementPath,'changed after selection');await assert.rejects(invoke(page,'confirm_source_replacement',{token:candidate.token}),/zmienił/);
 await invoke(page,'discard_source_replacement',{token:candidate.token});await assert.rejects(invoke(page,'confirm_source_replacement',{token:candidate.token}),/ponownie/);
 fs.copyFileSync(template,replacementPath);await assert.rejects(invoke(page,'prepare_preview',{path:candidate.path}),/Brak uprawnień/);assert.equal(fs.readFileSync(projectPath,'utf8'),json);
 console.log('0.23 native authorization: unaccepted, unknown, changed and discarded candidates rejected; project untouched: OK');
}
export async function testMissingRelink023(page,projectPath){
 const saved=JSON.parse(fs.readFileSync(projectPath,'utf8')),missing=structuredClone(saved);missing.media.path=path.join(path.dirname(projectPath),'Przeniesiony nieistniejący film.mp4');fs.writeFileSync(projectPath,JSON.stringify(missing));
 await page.keyboard.press('Control+o');await page.waitForFunction(()=>document.querySelector('.file-missing')&&!document.querySelector('.header-project-name')?.disabled);
 await page.getByRole('tab',{name:/Pliki/}).click();await page.getByRole('textbox',{name:'Szukaj pliku w projekcie',exact:true}).fill('nie pasuje do żadnej nazwy');
 await page.locator('.header-export').click();const report=page.getByRole('dialog',{name:'Sprawdzenie przed eksportem',exact:true});await report.waitFor();assert(await report.getByRole('button',{name:/Kontynuuj eksport MP4|Eksportuj mimo ostrzeżeń/}).isDisabled());assert((await report.innerText()).includes('blokuje eksport'));await page.screenshot({path:'.tools/native-sources023-missing.png'});
 await report.getByRole('button',{name:'Pokaż plik w bibliotece',exact:true}).first().click();const card=page.locator('[data-media-id="primary"]');await card.waitFor();assert((await card.getAttribute('class')).includes('source-highlight'));const details=card.locator('.media-source-actions');if(!await details.evaluate(el=>el.open))await details.locator('summary').click();await card.getByRole('button',{name:'Odnajdź plik…',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Odnajdź źródło',exact:true});await dialog.waitFor();await dialog.getByRole('checkbox',{name:/Potwierdzam: to ten sam materiał/}).check();await dialog.getByRole('button',{name:'Zastosuj źródło',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.waitForFunction(()=>!document.querySelector('.header-project-name')?.disabled);await page.locator('.header-save').click();await page.waitForFunction(()=>document.querySelector('.header-save')?.dataset.saveStatus==='saved');const relinked=JSON.parse(fs.readFileSync(projectPath,'utf8'));assert.notEqual(relinked.media.path,missing.media.path);assert.deepEqual(relinked.clips,saved.clips);assert.deepEqual(relinked.timelineSegments,saved.timelineSegments);assert.deepEqual(relinked.captionEdits,saved.captionEdits);assert.deepEqual(relinked.segments,saved.segments);
 await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2);assert.equal(await card.locator('.file-missing').count(),0);
 // Reopen the persisted repair, then restore this test's original project for later suites.
 await page.keyboard.press('Control+o');await page.waitForFunction(()=>!document.querySelector('.header-project-name')?.disabled&&document.querySelector('video.mlt-video')?.readyState>=2);assert.equal(await page.locator('[data-media-id="primary"] .file-missing').count(),0);
 fs.writeFileSync(projectPath,JSON.stringify(saved));await page.keyboard.press('Control+o');await page.waitForFunction(()=>!document.querySelector('.header-project-name')?.disabled&&document.querySelector('video.mlt-video')?.readyState>=2);
 console.log('0.23 native missing source: blocking report, locate in library, explicit relink, stable montage, save/reopen and restored playback: OK');
}
