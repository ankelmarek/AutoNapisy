import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
export async function testRecentNative(page){
 const historyFile=path.join(process.env.ROLVIXA_TEST_HISTORY,'projects.json'),projectPath=process.env.ROLVIXA_TEST_PROJECT;
 const menu=async label=>{await page.locator('.project-menu summary').click();await page.locator('.project-menu-popup').getByRole('button',{name:label,exact:true}).click();};
 const registry=()=>JSON.parse(fs.readFileSync(historyFile,'utf8'));
 const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await page.waitForTimeout(50);}throw Error('History update timed out');};
 let catalog=registry();assert.equal(catalog.version,1);assert(catalog.entries.length>=2&&catalog.entries.length<=6);
 const entry=catalog.entries.find(e=>path.basename(e.path)==='projekt.json'),copy=catalog.entries.find(e=>path.basename(e.path)==='projekt-copy.json');assert(entry&&copy);
 const before=fs.readFileSync(projectPath,'utf8');const unknown=await page.evaluate(async id=>{try{await window.__TAURI_INTERNALS__.invoke('open_recent_project',{id});return '';}catch(e){return String(e);}},projectPath);assert(unknown.includes('Nieznany projekt'));assert.equal(fs.readFileSync(projectPath,'utf8'),before);
 await menu('Ostatnie projekty');const home=page.getByRole('main',{name:'Ekran startowy',exact:true});await home.waitFor();await page.locator(`.recent-card[data-recent-id="${entry.id}"]`).waitFor();
 const copyBytes=fs.readFileSync(copy.path,'utf8');
 try{
  fs.writeFileSync(copy.path,JSON.stringify({...JSON.parse(copyBytes),schemaVersion:99}));await page.locator(`.recent-card[data-recent-id="${copy.id}"] .recent-open`).click();await home.getByRole('alert').waitFor();assert((await home.innerText()).includes('wersj'));assert.equal(registry().entries[0].id,catalog.entries[0].id);
  fs.writeFileSync(copy.path,copyBytes);fs.renameSync(copy.path,copy.path+'.missing');
  try{await page.locator(`.recent-card[data-recent-id="${copy.id}"] .recent-open`).click();await page.waitForFunction(()=>document.querySelector('.start-warning')?.textContent.includes('niedostępny'));await page.locator(`.recent-card[data-recent-id="${copy.id}"] .recent-remove`).click();await page.locator(`.recent-card[data-recent-id="${copy.id}"]`).waitFor({state:'detached'});assert(fs.existsSync(copy.path+'.missing'));}
  finally{fs.renameSync(copy.path+'.missing',copy.path);}
 }finally{fs.writeFileSync(copy.path,copyBytes);}
 await home.getByRole('checkbox',{name:'Pokazuj przy uruchomieniu'}).uncheck();await wait(()=>!registry().showOnStartup);await page.reload();await page.waitForFunction(()=>!document.querySelector('.editor-ui')?.hidden&&!document.querySelector('.header-project-name')?.disabled);assert.equal(await page.locator('.start-screen').count(),0);
 await menu('Ostatnie projekty');await home.waitFor();await home.getByRole('checkbox',{name:'Pokazuj przy uruchomieniu'}).check();await wait(()=>registry().showOnStartup);await page.screenshot({path:'.tools/native-recent021.png'});
 await page.locator(`.recent-card[data-recent-id="${entry.id}"] .recent-open`).focus();await page.keyboard.press('Enter');await home.waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelector('.header-save')?.dataset.saveStatus==='saved');assert.equal(fs.readFileSync(projectPath,'utf8'),before);assert.equal(registry().entries[0].id,entry.id);
 // A broken history cannot turn a successful project save into an error.
 fs.renameSync(historyFile,historyFile+'.backup');fs.mkdirSync(historyFile);
 try{await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('.header-save')?.dataset.saveStatus==='saved'&&!!document.querySelector('.recent-editor-warning'));assert.equal(JSON.parse(fs.readFileSync(projectPath,'utf8')).schemaVersion,18);}
 finally{fs.rmdirSync(historyFile);fs.renameSync(historyFile+'.backup',historyFile);}
 await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('.header-save')?.dataset.saveStatus==='saved'&&!document.querySelector('.recent-editor-warning'));
 console.log('Real 0.21 MRU: native ID authorization, Open/Save/Save As ordering, Unicode, future/missing files, entry-only removal, preference/reload, keyboard open and save despite failed history: OK');
}
