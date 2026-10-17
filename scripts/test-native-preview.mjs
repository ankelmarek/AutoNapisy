// Real installed app, real native commands, real MLT, incremental file reads and MSE.
// Only the OS project dialog is replaced in the separately compiled ui-tests binary.
import {chromium} from 'playwright-core';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

if(process.argv.includes('--prepare')){
 const projectPath=process.env.ROLVIXA_TEST_PROJECT;
 assert(projectPath);fs.mkdirSync(path.dirname(projectPath),{recursive:true});
 const source=path.join(path.dirname(projectPath),'Film pionowy Łódź.mp4');
 execFileSync(process.env.AUTONAPISY_FFMPEG,['-v','error','-y','-f','lavfi','-i','testsrc2=s=360x640:r=30:d=8','-f','lavfi','-i','sine=frequency=440:duration=8','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',source]);
 fs.writeFileSync(projectPath,JSON.stringify({schemaVersion:6,name:'Prawdziwy podgląd',media:{path:path.toNamespacedPath(source),name:path.basename(source),duration:8},assets:[],clips:[{id:'first',sourceIn:0,sourceOut:4,start:0,kind:'video',volume:1},{id:'second',sourceIn:4,sourceOut:8,start:4,kind:'video',volume:1}],transitions:[],segments:[],styles:{default:{fontFamily:'Arial',fontSize:42,color:'#ffffff',background:'#000000',position:'bottom'}},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
 process.exit(0);
}
const browser=await chromium.connectOverCDP(process.env.ROLVIXA_WEBVIEW_CDP);
const page=browser.contexts()[0].pages()[0];
page.setDefaultTimeout(45000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))console.log('WebView2:',m.type(),m.text());});
try{
 await page.reload();
 await page.locator('.project-menu summary').click();
 await page.locator('.project-menu-popup').getByRole('button',{name:'Otwórz',exact:true}).click();
 await page.waitForSelector('.edit-clip');
 const state=()=>page.locator('video.mlt-video').evaluate(v=>({src:v.currentSrc,ready:v.readyState,network:v.networkState,time:v.currentTime,paused:v.paused,error:v.error&&{code:v.error.code,message:v.error.message},buffer:Array.from({length:v.buffered.length},(_,i)=>[v.buffered.start(i),v.buffered.end(i)])}));
 try{await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2,{},{timeout:45000});}
 catch(e){console.log('Native preview failed:',JSON.stringify(await state()),'footer:',await page.locator('footer').textContent());throw e;}
 // A decoded frame must contain actual video pixels, not only a moving timer.
 const pixels=await page.locator('video.mlt-video').evaluate(v=>{const c=document.createElement('canvas');c.width=16;c.height=16;const x=c.getContext('2d');x.drawImage(v,0,0,16,16);return [...x.getImageData(0,0,16,16).data].filter((_,i)=>i%4!==3).some(v=>v>35);});
 assert(pixels,'Real MLT frame is black');
 await page.getByRole('button',{name:'▶',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.currentTime>.3);
 const seek=page.getByRole('slider',{name:'Pozycja odtwarzania',exact:true});
 await page.waitForFunction(()=>Number(document.querySelector('input[aria-label="Pozycja odtwarzania"]').value)>.3);
 await page.getByRole('button',{name:'Ⅱ',exact:true}).click();
 await seek.fill('6');
 await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2);
 await page.getByRole('button',{name:'▶',exact:true}).click();
 await page.waitForFunction(()=>Number(document.querySelector('input[aria-label="Pozycja odtwarzania"]').value)>6.3);
 await page.getByRole('button',{name:'Ⅱ',exact:true}).click();
 const sourceBefore=await page.locator('video.mlt-video').evaluate(v=>v.currentSrc);
 await page.getByRole('button',{name:'Ukryj V1',exact:true}).click();
 await page.waitForFunction(before=>{const v=document.querySelector('video.mlt-video');return v?.currentSrc!==before&&v?.readyState>=2;},sourceBefore);
 const hiddenPixels=await page.locator('video.mlt-video').evaluate(v=>{const c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d');x.drawImage(v,0,0,16,16);return [...x.getImageData(0,0,16,16).data].filter((_,i)=>i%4!==3);});
 assert(hiddenPixels.every(v=>v<25),'Eye must actually hide the MLT video, not only dim timeline clips');
 const hiddenSource=await page.locator('video.mlt-video').evaluate(v=>v.currentSrc);
 await page.getByRole('button',{name:'Ukryj V1',exact:true}).click();
 await page.waitForFunction(before=>{const v=document.querySelector('video.mlt-video');return v?.currentSrc!==before&&v?.readyState>=2;},hiddenSource);
 await page.getByRole('button',{name:'Wycisz V1',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Wycisz V1',exact:true}).getAttribute('aria-pressed'),'true');
 await page.keyboard.press('Control+z');
 assert.equal(await page.getByRole('button',{name:'Wycisz V1',exact:true}).getAttribute('aria-pressed'),'false');
 await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2);

 // Real paused layers, independent framing, drag commit and schema persistence.
 await seek.fill('1');
 await page.getByRole('combobox',{name:'Format obrazu'}).selectOption('1080x1080');
 await page.waitForSelector('.frame-editor[data-ready=true] .frame-layer');
 await page.getByRole('button',{name:'Warstwy',exact:true}).first().click();
 await page.getByRole('slider',{name:'Skala filmu',exact:true}).fill('1.5');
 await page.getByRole('spinbutton',{name:'Pozycja filmu X',exact:true}).fill('10');
 const layer=page.locator('.frame-layer[data-layer-id="first"]');
 await page.waitForFunction(()=>document.querySelector('.frame-layer[data-layer-id="first"]')?.style.transform.includes('scale(1.5)'));
 const box=await page.locator('.composition-surface').boundingBox();
 await page.mouse.move(box.x+box.width*.55,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.55,{steps:6});await page.mouse.up();
 assert(Math.abs(Number(await page.getByRole('spinbutton',{name:'Pozycja filmu X'}).inputValue())-20)<2,'Preview drag must update normalized X');
 await page.locator('.project-menu summary').click();await page.locator('.project-menu-popup').getByRole('button',{name:'Zapisz',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('select[aria-label="Format obrazu"]').disabled);
 const saved=JSON.parse(fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8'));
 assert.equal(saved.schemaVersion,8);assert.deepEqual(saved.canvas,{width:1080,height:1080});assert.equal(saved.clips[0].transform.scale,1.5);assert(Math.abs(saved.clips[0].transform.x-.2)<.02);
 await page.getByRole('tab',{name:'Audio',exact:true}).click();
 await page.getByRole('button',{name:'Dźwięki',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.audio-library-item').length===100);
 await page.getByRole('textbox',{name:'Szukaj efektu dźwiękowego'}).fill('Wybór 6');
 const sound=page.locator('.audio-library-item').first();
 await sound.getByRole('button',{name:/Odsłuchaj:/}).click();
 await page.waitForFunction(()=>{const a=document.querySelector('.audio-library audio');return a&&!a.paused&&a.currentTime>.05;});
 await sound.getByRole('button',{name:/Zatrzymaj:/}).click();
 // HTML5 drag uses the same project asset registration and A2 target as imported audio.
 await sound.dragTo(page.locator('.edit-canvas'),{targetPosition:{x:31,y:220}});
 await page.waitForSelector('.edit-clip.audio-clip');
 await page.locator('.project-menu summary').click();await page.locator('.project-menu-popup').getByRole('button',{name:'Zapisz',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('select[aria-label="Format obrazu"]').disabled);
 const audioSaved=JSON.parse(fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8'));
 const asset=audioSaved.assets.find(a=>a.provenance?.provider==='kenney');assert(asset,'Audio drag must persist source and CC0 attribution');
 assert(audioSaved.clips.some(c=>c.assetId===asset.id&&c.kind==='audio'&&c.track===1),'Audio must land on A2');
 assert.equal(asset.provenance.license,'CC0 1.0');
 console.log('Real native framing, pointer drag, v8 persistence, 100 Kenney sounds, audition and A2 drag: OK');
 // External API availability is diagnostic, not a fabricated search success.
 const openverse=await page.evaluate(async()=>{try{const p=await window.__TAURI_INTERNALS__.invoke('search_audio',{query:'piano',page:1,license:'cc0'});return {status:'ok',results:p.results.length};}catch(e){return {status:'unavailable',error:String(e)};}});
 console.log('Live Openverse API:',JSON.stringify(openverse));
 console.log('Real native preview (portrait, Unicode paths, decoded pixels, play, pause, seek):',JSON.stringify(await state()));
 assert.deepEqual(errors,[]);
}finally{
 await page.screenshot({path:'.tools/native-preview.png'}).catch(()=>{});
 await browser.close();
}
