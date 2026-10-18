import assert from 'node:assert/strict';
export async function settleEditor(page){
 await page.waitForFunction(()=>document.querySelector('.app')?.dataset.startupReady==='true');
 const home=page.getByRole('main',{name:'Ekran startowy',exact:true});
 if(await home.count())await home.getByRole('button',{name:'Nowy projekt',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.editor-ui')?.hidden&&!document.querySelector('.header-project-name')?.disabled);
}
export async function testStart021(page,action,width,height){
 await action('Zapisz');const original=await page.evaluate(()=>structuredClone(window.__saved));
 await page.evaluate(()=>{window.__recent={showOnStartup:false,warning:'',entries:Array.from({length:6},(_,i)=>({id:String(i+1).padStart(16,'0'),name:`Rolka Łódź ${i+1}`,path:`C:/Projekty/Łódź/rolka-${i+1}.json`,lastUsed:Date.now()-i*86400000}))};window.__missingRecent=window.__recent.entries[5].id;});
 await action('Ostatnie projekty');const home=page.getByRole('main',{name:'Ekran startowy',exact:true});await home.waitFor();await page.waitForFunction(()=>document.querySelectorAll('.recent-card').length===6);
 assert(await page.locator('.editor-ui').evaluate(el=>el.hidden&&el.inert));assert.equal(await page.locator('.recent-card').count(),6);await page.screenshot({path:`docs/start021-${width}x${height}.png`});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false,'Six recent cards must fit the laptop and Full HD');
 await home.getByRole('button',{name:'Otwórz projekt Rolka Łódź 6',exact:true}).click();await home.getByRole('alert').waitFor();assert((await home.innerText()).includes('niedostępny'));assert.deepEqual(await page.evaluate(()=>window.__saved),original);
 await home.getByRole('button',{name:'Usuń z ostatnich: Rolka Łódź 6',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.recent-card').length===5);
 await home.getByRole('checkbox',{name:'Pokazuj przy uruchomieniu'}).check();await page.waitForFunction(()=>window.__recent.showOnStartup);assert(await home.isVisible());
 await home.getByRole('button',{name:'Otwórz projekt Rolka Łódź 1',exact:true}).focus();await page.keyboard.press('Enter');await home.waitFor({state:'detached'});assert((await page.locator('.header-project-name').textContent()).includes('Rolka Łódź 1'));const opened=await page.evaluate(()=>window.__calls.find(c=>c.cmd==='open_recent_project'&&c.args.id==='0000000000000001'));assert(opened);assert.deepEqual(Object.keys(opened.args),['id']);
 await action('Ostatnie projekty');await home.waitFor();await home.getByRole('button',{name:'Wróć do montażu',exact:true}).click();await home.waitFor({state:'detached'});
 // Cancellation preserves the active project and the navigator; failure never blocks New.
 await page.evaluate(()=>window.__openCancel=true);await action('Ostatnie projekty');await home.getByRole('button',{name:'Otwórz projekt',exact:true}).click();assert(await home.isVisible());await page.evaluate(()=>{window.__openCancel=false;window.__recent={entries:[],showOnStartup:true,warning:'Uszkodzona historia — fixture'};});await home.getByRole('button',{name:'Odśwież historię',exact:true}).click();await home.getByRole('alert').waitFor();await home.getByRole('button',{name:'Nowy projekt',exact:true}).click();await home.waitFor({state:'detached'});assert.equal(await page.locator('.edit-clip').count(),0);
 await page.evaluate(()=>window.__recentDelay=500);await action('Ostatnie projekty');await home.getByRole('button',{name:'Nowy projekt',exact:true}).click();await home.waitFor({state:'detached'});await page.waitForTimeout(650);assert.equal(await page.locator('.start-screen').count(),0,'A late history response must not replace the active project');await page.evaluate(()=>window.__recentDelay=0);
 console.log(`0.21 six-card navigator, keyboard/ID-only open, missing-file removal, preference, Back, canceled dialog and New despite broken history: OK ${width}x${height}`);
}
