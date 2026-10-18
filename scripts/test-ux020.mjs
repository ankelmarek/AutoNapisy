import assert from 'node:assert/strict';
export async function testUx020(page,setup,stream,width,height){
 const split=axis=>page.getByRole('separator',{name:axis,exact:true});
 const left=split('Szerokość biblioteki'),right=split('Szerokość właściwości'),bottom=split('Wysokość osi czasu');
 const box=async axis=>Number(await axis.getAttribute('aria-valuenow'));
 const drag=async(axis,dx,dy)=>{const b=await axis.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:8});await page.mouse.up();};
 for(const axis of [left,right,bottom]){await axis.focus();await page.keyboard.press('Enter');}
 assert.equal(await page.getByRole('button',{name:'Warstwy',exact:true}).count(),0);assert.equal(await page.locator('.future-layers').count(),0);
 const base=await box(left);await drag(left,50,0);assert(Math.abs(await box(left)-base-50)<3);
 const stored=await page.evaluate(()=>localStorage.getItem('rolvixa.workspace.v1'));assert.equal(JSON.parse(stored).version,1);
 const rb=await box(right);await right.focus();await page.keyboard.press('ArrowRight');assert(Math.abs(await box(right)-rb+10)<3);
 const tb=await box(bottom);await bottom.focus();await page.keyboard.press('ArrowDown');assert(Math.abs(await box(bottom)-tb+10)<3);
 const beforeCancel=await box(left),storedCancel=await page.evaluate(()=>localStorage.getItem('rolvixa.workspace.v1')),b=await left.boundingBox();
 await page.mouse.move(b.x+5,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+85,b.y+b.height/2,{steps:5});await page.keyboard.press('Escape');await page.mouse.up();assert(Math.abs(await box(left)-beforeCancel)<2);assert.equal(await page.evaluate(()=>localStorage.getItem('rolvixa.workspace.v1')),storedCancel);
 await left.focus();await page.keyboard.press('End');await right.focus();await page.keyboard.press('End');
 assert((await page.locator('.preview').boundingBox()).width>=279);assert((await page.locator('.styling').boundingBox()).width>=259);
 await bottom.focus();await page.keyboard.press('Home');assert.equal(await box(bottom),220);assert((await page.locator('.workspace-panels').boundingBox()).height>=249);
 const body=page.locator('.timeline-body');await body.evaluate(el=>el.scrollTop=60);assert(await body.evaluate(el=>el.scrollTop)>30);assert(Math.abs((await page.locator('.track-heads').boundingBox()).y-(await page.locator('.edit-canvas').boundingBox()).y)<2,'Track headers and clips must scroll together');await body.evaluate(el=>el.scrollTop=0);
 await left.focus();await page.keyboard.press('Enter');await right.focus();await page.keyboard.press('Enter');await bottom.focus();await page.keyboard.press('Enter');
 await right.focus();await page.keyboard.press('ArrowLeft');const persisted=await box(right);
 await page.reload();await page.evaluate(setup,stream);await page.waitForFunction(()=>document.querySelector('.brand-icon')?.naturalWidth>0);assert(Math.abs(await box(right)-persisted)<2,'Layout must survive actual WebView reload');
 await right.dblclick();await page.waitForTimeout(80);assert(Math.abs(await box(right)-rb)<3);
 assert.equal(await page.evaluate(()=>window.__saved),null,'Layout must never save or modify the project');
 const stage=await page.locator('.stage').boundingBox(),importButton=await page.locator('.stage').getByRole('button',{name:'Wybierz film',exact:true}).boundingBox();assert(importButton.y>=stage.y&&importButton.y+importButton.height<=stage.y+stage.height+1,'Empty preview must keep the import control inside the stage');
 await page.getByRole('tab',{name:'Efekty',exact:true}).click();assert.equal(await page.locator('.effect-card').count(),20);
 const card=page.getByRole('button',{name:'W lewo',exact:true});const tile=await card.boundingBox();assert(Math.abs(tile.width-tile.height)<2,'Transition tiles must be square');
 await card.focus();await card.hover();await page.waitForFunction(()=>{const v=document.querySelector('.effect-demo-video');return v?.readyState>=2&&!v.paused&&v.currentTime>.01;});assert.equal(await page.locator('.effect-demo-video').count(),1);assert((await page.locator('.effect-demo-video').getAttribute('src')).endsWith('/slideleft.mp4'));
 for(const name of ['Rozmycie','Przez czerń']){const c=page.getByRole('button',{name,exact:true});await c.focus();await c.hover();await page.waitForFunction(()=>document.querySelector('.effect-demo-video')?.readyState>=2);assert.equal(await page.locator('.effect-demo-video').count(),1);}
 await page.getByRole('button',{name:'Wstrzymaj podglądy przejść',exact:true}).click();assert.equal(await page.locator('.effect-demo-video').count(),0);
 await page.getByRole('button',{name:'Włącz podglądy przejść',exact:true}).click();await card.focus();await card.hover();await page.waitForSelector('.effect-demo-video');
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForSelector('.effect-demo-video',{state:'detached'});assert.equal(await page.locator('.effect-demo>img').count(),40);await page.emulateMedia({reducedMotion:'no-preference'});
 await card.focus();await card.hover();await page.waitForFunction(()=>document.querySelector('.effect-demo-video')?.readyState>=2);await page.keyboard.press('Escape');assert.equal(await page.locator('.effect-demo-video').count(),0);
 await page.screenshot({path:`docs/ux020-gallery-${width}x${height}.png`});
 await page.getByRole('tab',{name:/Pliki/}).click();assert.equal(await page.locator('.effect-demo-video').count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
 console.log(`0.20 bounded splitters/keyboard/Escape/reset/reload, square gallery/real MP4/one decoder/reduced motion and intact project: OK ${width}x${height}`);
}
