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
 console.log('Real native preview (portrait, Unicode paths, decoded pixels, play, pause, seek):',JSON.stringify(await state()));
 assert.deepEqual(errors,[]);
}finally{
 await page.screenshot({path:'.tools/native-preview.png'}).catch(()=>{});
 await browser.close();
}
