import {chromium} from '../.tools/browser/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);process.chdir(fileURLToPath(root));
const fixture=fs.readFileSync('.tools/edit-demo.webm');
const project={schemaVersion:4,name:'Studio · pliki i dźwięk',media:{path:'/first.webm',name:'Film pierwszy Łódź.webm',duration:12},assets:[{id:'second',path:'/second.webm',name:'Film drugi.webm',duration:12,kind:'video',segments:[]},{id:'music',path:'/music.webm',name:'Muzyka.webm',duration:12,kind:'audio',segments:[]}],clips:[{id:'a',start:0,sourceIn:0,sourceOut:2,track:0},{id:'b',start:2,sourceIn:2,sourceOut:4,track:0},{id:'c',start:4,sourceIn:5,sourceOut:7,track:0,assetId:'second'},{id:'music',start:0,sourceIn:0,sourceOut:6,track:1,kind:'audio',assetId:'music',volume:.5}],segments:[{id:'s',text:'To jest prawdziwy projekt demonstracyjny',start:0,end:3,words:[],styleId:'default'}],styles:{default:{fontFamily:'Bebas Neue',fontSize:56,color:'#080808',background:'#ffe600',position:'bottom',uppercase:true}},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
for(const [width,height] of [[1366,700],[1920,1080]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(json=>{window.__saved=null;window.__TAURI_INTERNALS__={convertFileSrc:path=>'/fixtures'+path,invoke:async(cmd,args)=>{if(cmd==='open_project')return {json,path:'/project.json'};if(cmd==='prepare_preview')return args.path;if(cmd==='save_project'){window.__saved=JSON.parse(args.json);return '/project.json';}throw Error(cmd);}};},JSON.stringify(project));
 await page.route('**/fixtures/**',r=>{const match=/bytes=(\d+)-(\d*)/.exec(r.request().headers().range??'');if(match){const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),fixture.length-1):fixture.length-1;return r.fulfill({status:206,contentType:'video/webm',headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${fixture.length}`},body:fixture.subarray(start,end+1)});}return r.fulfill({contentType:'video/webm',headers:{'accept-ranges':'bytes'},body:fixture});});
 await page.goto('http://127.0.0.1:1420');await page.getByRole('button',{name:'Otwórz',exact:true}).click();await page.waitForTimeout(500);
 await page.waitForFunction(()=>document.querySelector('.brand-icon')?.naturalWidth>0);assert.equal(await page.title(),'RolVixa');
 assert.equal(await page.getByRole('tab',{name:/Pliki/}).getAttribute('aria-selected'),'true');assert.equal(await page.locator('.library-file').count(),3);
 assert.equal(await page.locator('video').count(),2,'continuous razor cuts must share one decoder');
 await page.getByRole('textbox',{name:'Szukaj pliku w projekcie'}).fill('Łódź');assert.equal(await page.locator('.library-file').count(),1);await page.getByRole('textbox',{name:'Szukaj pliku w projekcie'}).fill('');
 await page.getByRole('tab',{name:'Napisy',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Transkrybuj po polsku'}).count(),1);await page.getByRole('tab',{name:/Pliki/}).click();
 assert(await page.locator('.timeline-toolbar button').evaluateAll(all=>all.every(b=>b.textContent.trim()===''&&b.getAttribute('aria-label')&&b.title)),'toolbar buttons need icons, names and tooltips');
 const line=page.getByRole('slider',{name:'Głośność: Muzyka.webm',exact:true});
 let box=await line.boundingBox();await page.mouse.move(box.x+50,box.y+5);await page.mouse.down();await page.mouse.move(box.x+50,box.y-15,{steps:8});await page.mouse.up();
 await page.getByRole('button',{name:/Zapisz/}).click();let saved=await page.evaluate(()=>window.__saved);assert.equal(saved.clips.find(c=>c.id==='music').volume,.75);assert.equal(saved.clips.find(c=>c.id==='music').start,0);
 await page.getByRole('button',{name:'Cofnij',exact:true}).click();assert.equal(await line.getAttribute('aria-valuenow'),'50');await page.getByRole('button',{name:'Ponów',exact:true}).click();assert.equal(await line.getAttribute('aria-valuenow'),'75');
 await line.focus();await page.keyboard.press('ArrowDown');assert.equal(await line.getAttribute('aria-valuenow'),'74');await page.keyboard.press('Shift+ArrowDown');assert.equal(await line.getAttribute('aria-valuenow'),'64');
 // A cancelled drag restores the audible preview and does not create a history entry.
 box=await line.boundingBox();await page.mouse.move(box.x+50,box.y+5);await page.mouse.down();await page.mouse.move(box.x+50,box.y+25,{steps:6});await line.dispatchEvent('pointercancel');await page.mouse.up();assert.equal(await line.getAttribute('aria-valuenow'),'64');
 const seek=page.getByRole('slider',{name:'Pozycja odtwarzania',exact:true});await seek.fill('1');await page.getByRole('button',{name:'▶',exact:true}).click();await page.waitForTimeout(250);
 box=await line.boundingBox();await page.mouse.move(box.x+50,box.y+5);await page.mouse.down();await page.mouse.move(box.x+50,box.y-3,{steps:5});await page.waitForTimeout(180);
 assert.equal(await page.locator('audio').evaluate(a=>a.paused),false,'volume drag must keep playing');assert(Math.abs(await page.locator('audio').evaluate(a=>a.volume)-.74)<.011,'audible volume preview must survive clock ticks');await page.mouse.up();await page.getByRole('button',{name:'Ⅱ',exact:true}).click();
 // Measure actual browser playback through a continuous razor cut and a different source.
 await seek.fill('0');await page.evaluate(()=>{window.__timing={start:0,end:0,frames:[],events:[]};for(const v of document.querySelectorAll('video'))for(const event of ['pause','seeking','waiting','playing'])v.addEventListener(event,()=>window.__timing.events.push({event,time:Number(document.querySelector('.timeline-seek').value),source:v.src}));});
 await page.getByRole('button',{name:'▶',exact:true}).click();await page.evaluate(()=>{const state=window.__timing;state.start=performance.now();const tick=()=>{const t=Number(document.querySelector('.timeline-seek').value);state.frames.push([performance.now()-state.start,t]);if(t<6)requestAnimationFrame(tick);else state.end=performance.now()-state.start;};requestAnimationFrame(tick);});
 await page.waitForFunction(()=>window.__timing.end>0,{},{timeout:10000});
 const timing=await page.evaluate(()=>window.__timing);assert(timing.end<6600,`playback stalled: ${timing.end}ms`);
 assert(!timing.events.some(e=>e.event==='pause'&&e.time>1.8&&e.time<2.2),'continuous razor cut paused the decoder');
 assert(!timing.events.some(e=>e.event==='seeking'&&e.time>3.8&&e.time<4.1&&e.source.endsWith('/second.webm')),'next source should be sought before the join');
 let longest=0,last=timing.frames[0];for(const f of timing.frames){if(Math.abs(f[1]-last[1])>.001)last=f;else if(f[1]>1.5&&f[1]<4.5)longest=Math.max(longest,f[0]-last[0]);}assert(longest<250,`freeze at join: ${longest}ms`);
 await page.getByRole('button',{name:'Dodaj na oś: Film drugi.webm',exact:true}).click();await page.getByRole('button',{name:/Zapisz/}).click();saved=await page.evaluate(()=>window.__saved);assert.equal(saved.clips.length,5);assert.equal(saved.assets.length,2);
 await page.locator('.library-list').evaluate(el=>el.scrollTop=0);await page.screenshot({path:`docs/studio-${width}x${height}.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false,'workspace overflow');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({viewport:[width,height],playbackMs:Math.round(timing.end),longestFreezeMs:Math.round(longest),library:'passed',volume:'drag, keyboard, undo, cancel and live preview passed'}));await page.close();
}
}finally{await browser.close();}
