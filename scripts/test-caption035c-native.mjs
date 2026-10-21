import assert from 'node:assert/strict';
import fs from 'node:fs';

// Real human speech and actual Whisper words from b. The new line is an editing
// fixture, never new ASR output. JS heap measurements exclude native processes.
export async function testCaption035c(page,projectPath,{open,save,edit,exportMp4,real}){
 const button=name=>page.getByRole('button',{name,exact:true}),text=()=>page.getByRole('textbox',{name:'Tekst zaznaczonego napisu',exact:true}),status=()=>page.locator('.caption-timing-status');
 const started=Date.now(),metrics={kind:'single Windows CI observation; not a hardware benchmark'};
 const memory=async()=>page.evaluate(()=>{const m=performance.memory;return m?{usedJSHeapSize:m.usedJSHeapSize,totalJSHeapSize:m.totalJSHeapSize,jsHeapSizeLimit:m.jsHeapSizeLimit}:null;});
 metrics.before=await memory();
 await open({...real,name:'0.35c — polska mowa, dwa wiersze'});await edit();
 const original=real.captionEdits['timeline:correction'].text,parts=original.split(/\s+/),middle=Math.ceil(parts.length/2),multiline=parts.slice(0,middle).join(' ')+'\n'+parts.slice(middle).join(' ');
 await text().fill(multiline);await text().press('Control+Enter');assert.equal(await status().getAttribute('data-timing'),'retained');let saved=await save();assert.equal(saved.captionEdits['timeline:correction'].textTiming.origin,'reanalyzed');assert.deepEqual(saved.timelineSegments,real.timelineSegments);assert.deepEqual(saved.clips,real.clips);
 const snapshot=JSON.stringify(saved.captionEdits),edge=page.getByRole('separator',{name:`Początek napisu: ${multiline}`,exact:true});await edge.scrollIntoViewIfNeeded();const box=await edge.boundingBox();assert(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await edge.evaluate(el=>el.addEventListener('pointerdown',e=>{el.dataset.testPointer=JSON.stringify({pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY,bubbles:true});},{once:true}));await page.mouse.down();await edge.evaluate(el=>{el.dispatchEvent(new PointerEvent('pointermove',JSON.parse(el.dataset.testPointer)));delete el.dataset.testPointer;});await page.mouse.up();assert.equal(JSON.stringify((await save()).captionEdits),snapshot,'No-op trim erased accepted timing');
 // A single timeline pointer gesture intentionally selects and closes text editing.
 await edit();
 const seek=page.getByRole('slider',{name:'Pozycja odtwarzania',exact:true});await seek.fill('2');await page.waitForFunction(()=>document.querySelector('.animated-caption-canvas')?.dataset.fallback==='false');
 // MSE starts at the seek point with local PTS=0; use the montage cursor.
 const decoded=async()=>{
  await page.waitForFunction(()=>{const v=document.querySelector('video.mlt-video');return v?.readyState>=2&&!v.seeking&&v.videoWidth>0&&Math.abs(Number(document.querySelector('input[aria-label="Pozycja odtwarzania"]').value)-2)<.1&&!document.querySelector('.transition-preparing');},{},{timeout:45000});
  assert(await page.locator('video.mlt-video').evaluate(v=>{const c=document.createElement('canvas');c.width=32;c.height=32;const x=c.getContext('2d');x.drawImage(v,0,0,32,32);return [...x.getImageData(0,0,32,32).data].some((value,i)=>i%4!==3&&value>80);}), 'Polish source preview has no decoded picture pixels');
 };
 for(const [width,height] of [[1366,700],[1920,1080]]){await page.setViewportSize({width,height});await page.getByRole('separator',{name:'Wysokość osi czasu',exact:true}).press('Home');await decoded();await status().scrollIntoViewIfNeeded();await page.screenshot({path:`.tools/caption035c-polish-${width}.png`});}
 await page.getByRole('separator',{name:'Wysokość osi czasu',exact:true}).press('Enter');
 await button('Eksport SRT').click();const srtPath=projectPath.replace(/\.json$/i,'.srt');for(let i=0;i<150;i++){if(fs.existsSync(srtPath)&&fs.readFileSync(srtPath,'utf8').includes('00:00:00,000 --> 00:00:04,500'))break;await page.waitForTimeout(100);}const srt=fs.readFileSync(srtPath,'utf8');assert(srt.includes('00:00:00,000 --> 00:00:04,500'));const strip=s=>s.normalize('NFC').toLocaleLowerCase('pl').replace(/\s+/g,' ').trim();assert.equal(strip(srt.split('\n').slice(2).join(' ')),strip(original));fs.writeFileSync('.tools/caption035-polish-multiline.srt',srt);await page.waitForFunction(()=>!document.querySelector('.header-export').disabled);
 await exportMp4('polish-multiline',{compare:true});
 const off=structuredClone(saved);off.name='0.35c — polska mowa, animacja Off';off.styles.default.animation.enabled=false;await open(off);await edit();assert.equal(await status().getAttribute('data-timing'),'retained');await exportMp4('polish-off');assert.deepEqual((await save()).captionEdits,saved.captionEdits);
 await open({...saved,name:'0.35c — ponownie po eksporcie'});await edit();assert.equal(await text().inputValue(),multiline);assert.equal(await status().getAttribute('data-timing'),'retained');
 await text().fill('Jutro zamykamy wszystkie nowe ulice');await text().press('Control+Enter');assert.equal(await status().getAttribute('data-timing'),'uncertain');const changed=await save();assert.equal(changed.captionEdits['timeline:correction'].textTiming,undefined);assert.deepEqual(changed.timelineSegments,real.timelineSegments);await page.locator('.header-save').focus();await page.keyboard.press('Control+z');assert.equal(await status().getAttribute('data-timing'),'retained');
 metrics.after=await memory();metrics.elapsedSeconds=(Date.now()-started)/1000;metrics.memoryScope='Chromium JS heap if exposed; excludes Rust/MLT/Whisper and native GPU memory';fs.writeFileSync('.tools/caption035c-native-metrics.json',JSON.stringify(metrics,null,2));
 console.log('0.35c native: real Polish speech + actual reanalysis, retained two-line text, no-op trim preserves accepted timing, Polish SRT, MP4/three nonzero A-B and Off, semantic rewrite fallback, one Undo/reopen, 1366/FHD and measured JS heap/time: OK');
}
