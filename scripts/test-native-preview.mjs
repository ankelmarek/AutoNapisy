// Real installed app, real native commands, real MLT, incremental file reads and MSE.
// Only the OS project dialog is replaced in the separately compiled ui-tests binary.
import {testRecentNative} from './test-recent-native.mjs';
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
const page=browser.contexts()[0].pages().find(p=>!p.url().startsWith('devtools:'))??await browser.contexts()[0].waitForEvent('page');
console.log('Initial WebView pages:',browser.contexts()[0].pages().map(p=>p.url()));
page.setDefaultTimeout(45000);
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('Page error:',e.stack??e.message);});page.on('console',m=>{if(['error','warning'].includes(m.type()))console.log('WebView2:',m.type(),m.text());});
const recoveryFile=path.join(process.env.ROLVIXA_TEST_RECOVERY,'current.json');
async function waitSnapshotName(name){for(let n=0;n<100;n++){try{if(JSON.parse(fs.readFileSync(recoveryFile,'utf8')).project.name===name)return;}catch{}await page.waitForTimeout(100);}throw Error('Missing recovery revision: '+name);}
try{
 // CDP can be ready before Tauri performs its first navigation. Reloading
 // about:blank here cancels startup, leaving a healthy app with an empty test page.
 await page.waitForURL(/tauri\.localhost|^tauri:/,{timeout:45000});
 await page.getByRole('main',{name:'Ekran startowy',exact:true}).waitFor();
 await page.reload();
 await page.getByRole('main',{name:'Ekran startowy',exact:true}).getByRole('button',{name:'Otwórz projekt',exact:true}).click();
 await page.waitForSelector('.edit-clip');
 const state=()=>page.locator('video.mlt-video').evaluate(v=>({src:v.currentSrc,ready:v.readyState,network:v.networkState,time:v.currentTime,paused:v.paused,error:v.error&&{code:v.error.code,message:v.error.message},buffer:Array.from({length:v.buffered.length},(_,i)=>[v.buffered.start(i),v.buffered.end(i)])}));
 try{await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2,{},{timeout:45000});}
 catch(e){console.log('Native preview failed:',JSON.stringify(await state()),'footer:',await page.locator('footer').textContent());throw e;}
 // A decoded frame must contain actual video pixels, not only a moving timer.
 const pixels=await page.locator('video.mlt-video').evaluate(v=>{const c=document.createElement('canvas');c.width=16;c.height=16;const x=c.getContext('2d');x.drawImage(v,0,0,16,16);return [...x.getImageData(0,0,16,16).data].filter((_,i)=>i%4!==3).some(v=>v>35);});
 assert(pixels,'Real MLT frame is black');
 await page.getByRole('button',{name:'Odtwórz film',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.currentTime>.3);
 const seek=page.getByRole('slider',{name:'Pozycja odtwarzania',exact:true});
 await page.waitForFunction(()=>Number(document.querySelector('input[aria-label="Pozycja odtwarzania"]').value)>.3);
 await page.getByRole('button',{name:'Wstrzymaj odtwarzanie',exact:true}).click();
 await seek.fill('6');
 await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2);
 await page.getByRole('button',{name:'Odtwórz film',exact:true}).click();
 await page.waitForFunction(()=>Number(document.querySelector('input[aria-label="Pozycja odtwarzania"]').value)>6.3);
 await page.getByRole('button',{name:'Wstrzymaj odtwarzanie',exact:true}).click();
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
 assert.equal(await page.getByRole('button',{name:'Warstwy',exact:true}).count(),0);await page.getByRole('button',{name:'Film / audio',exact:true}).click();
 await page.getByRole('slider',{name:'Skala filmu',exact:true}).fill('1.5');
 await page.getByRole('spinbutton',{name:'Pozycja filmu X',exact:true}).fill('10');
 const layer=page.locator('.frame-layer[data-layer-id="first"]');
 await page.waitForFunction(()=>document.querySelector('.frame-layer[data-layer-id="first"]')?.style.transform.includes('scale(1.5)'));
 const box=await page.locator('.composition-surface').boundingBox();
 await page.mouse.move(box.x+box.width*.55,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.55,{steps:6});await page.mouse.up();
 assert(Math.abs(Number(await page.getByRole('spinbutton',{name:'Pozycja filmu X'}).inputValue())-20)<2,'Preview drag must update normalized X');
 await page.locator('.project-menu summary').click();await page.locator('.project-menu-popup').getByRole('button',{name:'Zapisz',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.header-save').dataset.saveStatus==='saved');
 await page.waitForFunction(()=>!document.querySelector('select[aria-label="Format obrazu"]').disabled);
 const saved=JSON.parse(fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8'));
 assert.equal(saved.schemaVersion,10);assert.deepEqual(saved.canvas,{width:1080,height:1080});assert.equal(saved.clips[0].transform.scale,1.5);assert(Math.abs(saved.clips[0].transform.x-.2)<.02);
 // Resizing keeps the same MLT stream and normalized frame transform.
 await page.waitForTimeout(250);await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2);const stream020=await page.locator('video.mlt-video').getAttribute('src');const split020=page.getByRole('separator',{name:'Szerokość biblioteki',exact:true});await split020.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(150);assert.equal(await page.locator('video.mlt-video').getAttribute('src'),stream020);assert(Math.abs(Number(await page.getByRole('spinbutton',{name:'Pozycja filmu X',exact:true}).inputValue())-20)<2);await split020.dblclick();console.log('Real 0.20 splitters preserve native MLT stream and normalized frame transform: OK');
 await page.getByRole('tab',{name:'Audio',exact:true}).click();
 await page.getByRole('button',{name:'Dźwięki',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.audio-library-item').length===100);
 await page.getByRole('combobox',{name:'Kategoria dźwięków'}).selectOption('Kliknięcia');
 assert((await page.locator('.audio-library-item').count())<100);
 await page.getByRole('textbox',{name:'Szukaj efektu dźwiękowego'}).fill('Wybór 6');
 const sound=page.locator('.audio-library-item').first();
 await sound.getByRole('button',{name:/Odsłuchaj:/}).click();
 await page.waitForFunction(()=>{const a=document.querySelector('.audio-library audio');return a&&!a.paused&&a.currentTime>.05;});
 await sound.getByRole('button',{name:/Zatrzymaj:/}).click();
 // HTML5 drag uses the same project asset registration and A2 target as imported audio.
 await sound.dragTo(page.locator('.edit-canvas'),{targetPosition:{x:31,y:220}});
 await page.waitForSelector('.edit-clip.audio-clip');
 await page.locator('.project-menu summary').click();await page.locator('.project-menu-popup').getByRole('button',{name:'Zapisz',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.header-save').dataset.saveStatus==='saved');
 await page.waitForFunction(()=>!document.querySelector('select[aria-label="Format obrazu"]').disabled);

 // Real linked-audio automation: gesture -> native JSON -> MLT preview.
 const linkedAudio=page.getByRole('slider',{name:'Głośność: Film pionowy Łódź.mp4',exact:true}).first().locator('..');
 const linkedBox=await linkedAudio.boundingBox();await page.keyboard.down('Alt');await page.mouse.click(linkedBox.x+60,linkedBox.y+7);await page.keyboard.up('Alt');
 const linkedPoint=linkedAudio.locator('.audio-volume-point').first();await linkedPoint.focus();await page.keyboard.press('Shift+ArrowDown');await page.keyboard.press('Shift+ArrowDown');
 const nativeFade=linkedAudio.locator('.fade-in');await nativeFade.focus();for(let i=0;i<5;i++)await page.keyboard.press('Shift+ArrowRight');
 await page.locator('.header-save').click();await page.waitForFunction(()=>document.querySelector('.header-save').dataset.saveStatus==='saved');
 const nativeAudio=JSON.parse(fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8')).clips[0].audio;assert(Math.abs(nativeAudio.points[0].gain-.8)<.001);assert(Math.abs(nativeAudio.fadeIn.duration-.5)<.001);
 await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2);console.log('Real audio 0.16 linked point/fade controls, native v9 persistence and regenerated MLT preview: OK');
 const audioSaved=JSON.parse(fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8'));
 const asset=audioSaved.assets.find(a=>a.provenance?.provider==='kenney');assert(asset,'Audio drag must persist source and CC0 attribution');
 assert(audioSaved.clips.some(c=>c.assetId===asset.id&&c.kind==='audio'&&c.track===1),'Audio must land on A2');
 assert.equal(asset.provenance.license,'CC0 1.0');
 console.log('Real native framing, pointer drag, v9 persistence, 100 Kenney sounds, audition and A2 drag: OK');
 // Verify the real Openverse UI and Jamendo MP3 variants. External outages
 // remain visible diagnostics, while a successful search must retain results.
 await page.getByRole('button',{name:'Muzyka',exact:true}).click();
 await page.getByRole('textbox',{name:'Szukaj muzyki w Openverse'}).fill('piano');
 await page.getByRole('button',{name:'Szukaj',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.remote-audio')||document.querySelector('.audio-library-error')||document.querySelector('.audio-results .empty h3')?.textContent==='Brak wyników',{},{timeout:75000});
 if(await page.locator('.audio-library-error').count())console.log('Live Openverse unavailable:',await page.locator('.audio-library-error').textContent());
 else{
  const results=await page.locator('.remote-audio').count();assert(results>0,'Openverse piano search must retain valid music files');
  const remote=page.locator('.remote-audio').first();
  await remote.getByRole('button',{name:/Odsłuchaj:/}).click();
  await page.waitForFunction(()=>{const a=document.querySelector('.audio-library audio');return (a&&!a.paused&&a.currentTime>.05)||document.querySelector('.audio-library-error');},{},{timeout:45000});
  assert.equal(await page.locator('.audio-library-error').count(),0,'Available music source must support its temporary audition');
  const previewDuration=await page.locator('.audio-library audio').evaluate(a=>a.duration);assert(previewDuration>0&&previewDuration<=30.05);
  await page.getByRole('slider',{name:'Głośność odsłuchu'}).fill('0.35');assert(Math.abs(await page.locator('.audio-library audio').evaluate(a=>a.volume)-.35)<.01);
  await page.getByRole('button',{name:'Wstrzymaj odsłuch',exact:true}).click();assert(await page.locator('.audio-library audio').evaluate(a=>a.paused));
  await page.getByRole('slider',{name:'Pozycja odsłuchu'}).fill('5');await page.getByRole('button',{name:'Wznów odsłuch',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.audio-library audio').currentTime>5);
  await page.getByRole('button',{name:'Zatrzymaj odsłuch',exact:true}).click();
  await page.locator('.project-menu summary').click();await page.locator('.project-menu-popup').getByRole('button',{name:'Zapisz',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.header-save').dataset.saveStatus==='saved');
  await page.waitForFunction(()=>!document.querySelector('select[aria-label="Format obrazu"]').disabled);
  const untouched=JSON.parse(fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8'));assert.deepEqual(untouched.assets,audioSaved.assets,'Audition must not import files');assert.deepEqual(untouched.clips,audioSaved.clips,'Audition must not alter timeline');
  console.log('Real Openverse audition BEFORE import, volume, pause/seek/resume and unchanged project: OK');
  await page.locator('.remote-audio').first().getByRole('button',{name:'Pobierz do projektu'}).click();
  await page.waitForFunction(()=>document.querySelector('.audio-library-item')||document.querySelector('.audio-library-error'),{},{timeout:75000});
  if(await page.locator('.audio-library-error').count())console.log('Live Openverse provider unavailable:',await page.locator('.audio-library-error').textContent());
  else{
   const local=page.locator('.audio-library-item:visible').first();
   await local.getByRole('button',{name:/Odsłuchaj:/}).click();
   await page.waitForFunction(()=>{const a=document.querySelector('.audio-library audio');return a&&!a.paused&&a.currentTime>.05;});
   await local.getByRole('button',{name:/Zatrzymaj:/}).click();
   await page.locator('.project-menu summary').click();await page.locator('.project-menu-popup').getByRole('button',{name:'Zapisz',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.header-save').dataset.saveStatus==='saved');
   await page.waitForFunction(()=>!document.querySelector('select[aria-label="Format obrazu"]').disabled);
   const musicSaved=JSON.parse(fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8'));
   const music=musicSaved.assets.find(a=>a.provenance?.provider==='openverse');assert(music&&music.duration>0,'Downloaded track must be probed and persisted');assert(music.path.endsWith('.mp3'));assert(music.provenance.sourceUrl&&music.provenance.licenseUrl&&music.provenance.attribution);
   console.log('Live Openverse search, download, FFprobe, local audition and attribution persistence: OK',JSON.stringify({results,duration:music.duration,license:music.provenance.license}));
  }
 }
 // Real persistent proxy generation and MLT source switching through the UI.
 const beforeProxy=JSON.parse(fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8'));
 await page.getByRole('tab',{name:/Pliki/}).click();const card=page.locator('.library-file').first();
 await card.locator('.media-proxy summary').click();await card.getByRole('button',{name:'Przygotuj proxy 540p'}).click();
 await page.waitForFunction(()=>document.querySelector('.proxy-state.ready')?.textContent.includes('Proxy 540p'),{},{timeout:60000});
 await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2);
 await page.getByRole('button',{name:'Odtwórz film',exact:true}).click();await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.currentTime>.2);await page.getByRole('button',{name:'Wstrzymaj odtwarzanie',exact:true}).click();
 await card.getByRole('button',{name:'Używaj oryginału'}).click();await page.waitForFunction(()=>document.querySelector('.proxy-state.ready')?.textContent.includes('Oryginał'));
 await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2);
 await page.locator('.project-menu summary').click();await page.locator('.project-menu-popup').getByRole('button',{name:'Zapisz',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.header-save').dataset.saveStatus==='saved');await page.waitForFunction(()=>!document.querySelector('select[aria-label="Format obrazu"]').disabled);
 const afterProxy=JSON.parse(fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8'));assert.deepEqual(afterProxy.media,beforeProxy.media);assert.deepEqual(afterProxy.assets,beforeProxy.assets);assert.deepEqual(afterProxy.clips,beforeProxy.clips);assert(!JSON.stringify(afterProxy).includes('video-proxy-v1'),'Cache paths must never enter the project');
 console.log('Real proxy generation, play through MLT, original/proxy switch and unchanged persisted original sources: OK');
 // Real filesystem conflict + Save As + direct-save target switching.
 const projectPath=process.env.ROLVIXA_TEST_PROJECT,copyPath=projectPath.replace(/\.json$/i,'-copy.json');
 const external={...afterProxy,name:'Zmiana spoza RolVixa'};fs.writeFileSync(projectPath,JSON.stringify(external));
 await page.locator('.header-project-name').click();await page.getByRole('textbox',{name:'Nazwa projektu',exact:true}).fill('Moja kopia');await page.keyboard.press('Enter');await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>document.querySelector('.header-save').dataset.saveStatus==='error');assert.equal(JSON.parse(fs.readFileSync(projectPath,'utf8')).name,external.name);
 await page.keyboard.press('Control+Shift+s');await page.waitForFunction(()=>document.querySelector('.header-save').dataset.saveStatus==='saved');assert.equal(JSON.parse(fs.readFileSync(copyPath,'utf8')).name,'Moja kopia');
 await page.locator('.header-project-name').click();await page.getByRole('textbox',{name:'Nazwa projektu',exact:true}).fill('Moja kopia 2');await page.keyboard.press('Enter');await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('.header-save').dataset.saveStatus==='saved');assert.equal(JSON.parse(fs.readFileSync(copyPath,'utf8')).name,'Moja kopia 2');assert.equal(JSON.parse(fs.readFileSync(projectPath,'utf8')).name,external.name);
 await page.keyboard.press('Control+o');await page.waitForFunction(()=>document.querySelector('.header-project-name').textContent.includes('Zmiana spoza RolVixa'));await page.waitForFunction(()=>!document.querySelector('.header-project-name').disabled);
 await page.locator('.header-project-name').click();await page.getByRole('textbox',{name:'Nazwa projektu',exact:true}).fill('Otwarty i zapisany');await page.keyboard.press('Enter');await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('.header-save').dataset.saveStatus==='saved');assert.equal(JSON.parse(fs.readFileSync(projectPath,'utf8')).name,'Otwarty i zapisany');assert.equal(JSON.parse(fs.readFileSync(copyPath,'utf8')).name,'Moja kopia 2');
 console.log('Real Windows atomic save, external-change conflict, Save As and opened/direct target switching: OK');


 // 0.18: real IPC accepts detached audio, renders it and roundtrips schema v10.
 const beforeDetach18=JSON.parse(fs.readFileSync(projectPath,'utf8'));
 await page.locator('.edit-clip[data-clip-id="first"]:not(.audio-clip)').click({position:{x:22,y:12}});
 await page.getByRole('button',{name:'Odłącz audio → A1',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2);
 await page.locator('.header-save').click();await page.waitForFunction(()=>document.querySelector('.header-save').dataset.saveStatus==='saved');
 const detached18=JSON.parse(fs.readFileSync(projectPath,'utf8'));assert.equal(detached18.schemaVersion,10);assert.equal(detached18.clips.length,beforeDetach18.clips.length+1);assert(detached18.clips.find(c=>c.id==='first').audioDetached);assert(detached18.clips.some(c=>c.kind==='audio'&&c.syncGroup));assert.equal(await page.locator('.edit-clip[data-clip-id="first"].audio-clip').count(),0);
 await page.keyboard.press('Control+z');await page.locator('.header-save').click();await page.waitForFunction(()=>document.querySelector('.header-save').dataset.saveStatus==='saved');assert.deepEqual(JSON.parse(fs.readFileSync(projectPath,'utf8')).clips,beforeDetach18.clips);
 await page.getByRole('button',{name:'Tryb Ripple',exact:true}).click();await page.locator('.edit-clip[data-clip-id="first"]:not(.audio-clip)').click({position:{x:22,y:12}});
 await page.getByRole('spinbutton',{name:'Wyjście źródła',exact:true}).fill('3');await page.getByRole('spinbutton',{name:'Wyjście źródła',exact:true}).press('Enter');await page.getByRole('dialog',{name:'Podgląd Ripple',exact:true}).waitFor();await page.getByRole('button',{name:'Anuluj',exact:true}).click();await page.getByRole('button',{name:'Tryb Ripple',exact:true}).click();
 await page.locator('.header-save').click();await page.waitForFunction(()=>document.querySelector('.header-save').dataset.saveStatus==='saved');assert.deepEqual(JSON.parse(fs.readFileSync(projectPath,'utf8')).clips,beforeDetach18.clips);
 console.log('Real 0.18 detach / native MLT / v10 manual save / single Undo / Ripple preview and cancel: OK');

 // 0.17: real source viewer uses MLT, real Unicode thumbnail uses FFmpeg.
 await page.getByRole('tab',{name:/Pliki/}).click();await page.locator('.media-proxy[open]').evaluateAll(nodes=>nodes.forEach(n=>n.open=false));
 const sourceCard17=page.locator('.library-file').first();await sourceCard17.locator('.media-thumbnail').scrollIntoViewIfNeeded();await sourceCard17.locator('.media-thumbnail img').waitFor();const thumbURL17=await sourceCard17.locator('.media-thumbnail img').getAttribute('src');assert(thumbURL17.startsWith('data:image/png;base64,'));
 await sourceCard17.getByRole('button',{name:/Podgląd źródła:/}).click();await page.waitForFunction(()=>document.querySelector('.source-stage video')?.readyState>=2);await page.getByRole('slider',{name:'Pozycja w źródle'}).fill('2');await page.locator('.source-viewer').focus();await page.keyboard.press('i');await page.getByRole('slider',{name:'Pozycja w źródle'}).fill('5');await page.locator('.source-viewer').focus();await page.keyboard.press('o');
 assert.equal(Number(await page.getByRole('spinbutton',{name:'Początek zakresu źródła'}).inputValue()),2);assert.equal(Number(await page.getByRole('spinbutton',{name:'Koniec zakresu źródła'}).inputValue()),5);await page.waitForFunction(()=>document.querySelector('.source-stage video')?.readyState>=2);await page.getByRole('button',{name:'Odtwórz źródło',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.source-stage video')?.currentTime>.15);await page.getByRole('button',{name:'Wstrzymaj źródło',exact:true}).click();
 await page.getByRole('button',{name:'Dodaj zaznaczony fragment',exact:true}).click();await page.locator('.header-save').click();await page.waitForFunction(()=>document.querySelector('.header-save').dataset.saveStatus==='saved');const rangeProject17=JSON.parse(fs.readFileSync(projectPath,'utf8'));assert.equal(rangeProject17.clips.at(-1).sourceIn,2);assert.equal(rangeProject17.clips.at(-1).sourceOut,5);
 // Persist unsaved work; renderer restart must offer recovery, never overwrite manual JSON.
 const manualBytes17=fs.readFileSync(projectPath,'utf8');await page.locator('.header-project-name').click();await page.getByRole('textbox',{name:'Nazwa projektu',exact:true}).fill('Odzyskana Łódź 0.17');await page.keyboard.press('Enter');await waitSnapshotName('Odzyskana Łódź 0.17');const recoveryPath17=path.join(process.env.ROLVIXA_TEST_RECOVERY,'current.json');assert.equal(JSON.parse(fs.readFileSync(recoveryPath17,'utf8')).project.name,'Odzyskana Łódź 0.17');assert.equal(fs.readFileSync(projectPath,'utf8'),manualBytes17);
 await page.reload();await page.getByRole('dialog',{name:'Odzyskaj pracę'}).waitFor();await page.getByRole('button',{name:'Odzyskaj',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.header-project-name')?.textContent.includes('Odzyskana Łódź 0.17'));assert.equal(await page.locator('.header-save').getAttribute('data-save-status'),'dirty');assert.equal(fs.readFileSync(projectPath,'utf8'),manualBytes17);await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2);
 // First edit after recovery has a clean history boundary; Undo preserves recovered baseline.
 await page.locator('.header-project-name').click();await page.getByRole('textbox',{name:'Nazwa projektu',exact:true}).fill('Po odzyskaniu');await page.keyboard.press('Enter');await page.keyboard.press('Control+z');assert((await page.locator('.header-project-name').textContent()).includes('Odzyskana Łódź 0.17'));
 // Reload again: saved-project choice reads the current manual file, retaining conflict protection.
 await waitSnapshotName('Odzyskana Łódź 0.17');await page.reload();await page.getByRole('dialog',{name:'Odzyskaj pracę'}).waitFor();await page.getByRole('button',{name:'Otwórz zapisany projekt',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.header-save')?.dataset.saveStatus==='saved');assert((await page.locator('.header-project-name').textContent()).includes('Otwarty i zapisany'));
 console.log('Real 0.17 Unicode source thumbnail/MLT, source I/O, persisted range, renderer restart recovery, manual-file protection and Undo: OK');
 console.log('Real native preview (portrait, Unicode paths, decoded pixels, play, pause, seek):',JSON.stringify(await state()));
 // UX A: native SRT export must use montage captions even with no source transcript.
 const srtSeed19=JSON.parse(fs.readFileSync(projectPath,'utf8'));srtSeed19.segments=[];srtSeed19.captionEdits={};srtSeed19.timelineSegments=[{id:'native-srt19',text:'Zażółć gęślą',start:1.25,end:2.5,words:[],styleId:'default'}];fs.writeFileSync(projectPath,JSON.stringify(srtSeed19));
 await page.keyboard.press('Control+o');await page.waitForFunction(()=>!!document.querySelector('.caption-timeline-clip'));
 await page.getByRole('tab',{name:'Napisy',exact:true}).click();const srtActions19=page.getByRole('group',{name:'Tworzenie i eksport napisów',exact:true});await srtActions19.getByRole('button',{name:'Eksport SRT',exact:true}).focus();await page.keyboard.press('Enter');
 const srtPath19=projectPath.replace(/\.json$/i,'.srt');for(let n=0;n<100&&!fs.existsSync(srtPath19);n++)await page.waitForTimeout(100);assert(fs.existsSync(srtPath19),'Native SRT export did not write the selected file');const srtBytes19=fs.readFileSync(srtPath19,'utf8');assert(srtBytes19.includes('Zażółć gęślą'));assert(srtBytes19.includes('00:00:01,250 --> 00:00:02,500'));await page.waitForFunction(()=>!document.querySelector('.header-project-name').disabled);
 assert.equal((await page.locator('.header-export').innerText()).trim(),'Eksportuj');await page.screenshot({path:'.tools/native-ux019.png'});console.log('Real 0.19 SRT: empty source transcript, montage captions, keyboard activation, Unicode and actual atomically saved file: OK');
 await testRecentNative(page);
 // Leave a real recovery copy for the forced process-restart test in PowerShell.
 await page.locator('.header-project-name').click();await page.getByRole('textbox',{name:'Nazwa projektu',exact:true}).fill('Przed awarią procesu 0.17');await page.keyboard.press('Enter');await waitSnapshotName('Przed awarią procesu 0.17');
 assert.deepEqual(errors,[]);
}catch(e){
 console.log('Native UI failure:',{url:page.url(),errors,body:(await page.locator('body').innerText().catch(()=>'' )).slice(0,6000)});throw e;
}finally{
 await page.screenshot({path:'.tools/native-preview.png'}).catch(()=>{});
 await browser.close();
}
