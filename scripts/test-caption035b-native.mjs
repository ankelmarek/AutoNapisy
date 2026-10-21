import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export async function testCaption035b(page,projectPath,{seed,open,save,edit,exportMp4}){
 const button=name=>page.getByRole('button',{name,exact:true}),status=()=>page.locator('.caption-timing-status'),text=()=>page.getByRole('textbox',{name:'Tekst zaznaczonego napisu',exact:true}),word=(edge,i)=>page.getByRole('spinbutton',{name:`${edge} słowa ${i}`,exact:true});
 const choose=async()=>{await edit();await button('Ustaw czasy ręcznie').click();};
 await open({...seed,name:'0.35b — ręczne czasy i dodane słowo'});await edit();
 await text().fill('Dzisiaj otwieramy całkiem nową drogę');await text().press('Control+Enter');assert.equal(await status().getAttribute('data-timing'),'uncertain');const corrected=await save();
 await button('Ustaw czasy ręcznie').click();assert.equal(await word('Początek',3).inputValue(),'');assert((await page.locator('.caption-word-editor').innerText()).includes('Zachowane punkty: 4/5'));
 await button('Zastosuj czasy słów').click();await page.getByRole('alert').filter({hasText:'Uzupełnij'}).waitFor();assert.deepEqual((await save()).captionEdits,corrected.captionEdits);
 for(let i=1;i<=5;i++){await word('Początek',i).fill(String(.05+(i-1)*.55));await word('Koniec',i).fill(String(.45+(i-1)*.55));}
 await button('Zastosuj czasy słów').click();await page.waitForFunction(()=>document.querySelector('.caption-timing-status')?.dataset.timing==='manual');let manual=await save();assert.equal(manual.schemaVersion,18);assert.equal(manual.captionEdits['timeline:correction'].textTiming.mode,'manual');assert.equal(manual.captionEdits['timeline:correction'].textTiming.words.length,5);assert.deepEqual(manual.timelineSegments,seed.timelineSegments);assert.deepEqual(manual.clips,seed.clips);
 await page.locator('.header-save').focus();await page.keyboard.press('Control+z');assert.equal(await status().getAttribute('data-timing'),'uncertain');assert.deepEqual((await save()).captionEdits,corrected.captionEdits);await page.keyboard.press('Control+y');assert.equal(await status().getAttribute('data-timing'),'manual');await save();
 await button('Ustaw czasy ręcznie').click();await word('Początek',1).fill('.12');await button('Odrzuć czasy').click();assert.deepEqual((await save()).captionEdits,manual.captionEdits);
 const seek=page.getByRole('slider',{name:'Pozycja odtwarzania',exact:true});await seek.fill('1.3');await page.waitForFunction(()=>document.querySelector('.animated-caption-canvas')?.dataset.activeWord==='2'&&document.querySelector('.animated-caption-canvas')?.dataset.fallback==='false');
 await choose();for(const [width,height] of [[1366,700],[1920,1080]]){await page.setViewportSize({width,height});await page.locator('.caption-word-table').scrollIntoViewIfNeeded();await page.screenshot({path:`.tools/caption035b-manual-${width}.png`});}await button('Odrzuć czasy').click();await exportMp4('manual');
 await open({...manual,name:'0.35b — ręczne czasy po Open'});await edit();assert.equal(await status().getAttribute('data-timing'),'manual');await button('Blokada T').click();assert(await button('Ustaw czasy ręcznie').isDisabled());assert(await button('Dopasuj do nagrania').isDisabled());await button('Blokada T').click();

 // Actual Polish human speech: the transcript below comes from the separate
 // real whisper.cpp integration in this run, never from a synthetic ASR stub.
 const recognized=JSON.parse(fs.readFileSync('.tools/caption035b-recognized.json','utf8')),actual=recognized.map(s=>s.text).join(' '),source=path.join(path.dirname(projectPath),'Polska wypowiedź 0.35b Łódź.mp4');
 execFileSync(process.env.AUTONAPISY_FFMPEG,['-v','error','-y','-f','lavfi','-i','testsrc2=size=320x568:rate=30:duration=4.5','-i',path.resolve('.tools/caption035b-polish.wav'),'-t','4.5','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',source]);
 const real={...seed,schemaVersion:18,name:'0.35b — rzeczywista polska mowa',media:{path:source,name:path.basename(source),duration:4.5},assets:[],clips:[{id:'polish',kind:'video',sourceIn:0,sourceOut:4.5,start:0,audioRoute:'A1'}],transitions:[],tracks:{},timelineSegments:[{id:'correction',text:actual,start:0,end:4.5,styleId:'default',words:recognized.flatMap(s=>s.words)}],captionEdits:{'timeline:correction':{trimStart:0,trimEnd:0,text:actual,textTiming:{mode:'board'}}}};
 await open(real);await edit();const baseline=await save();
 const analyze=async()=>{await button('Dopasuj do nagrania').click();await page.locator('.caption-word-table').waitFor({timeout:90000});};
 // Cancellation must not accept a late result or mutate the board decision.
 await button('Dopasuj do nagrania').click();await button('Anuluj dopasowanie').click();await page.getByRole('alert').filter({hasText:'Anulowano'}).waitFor({timeout:30000});assert.deepEqual((await save()).captionEdits,baseline.captionEdits);
 await analyze();assert.deepEqual((await save()).captionEdits,baseline.captionEdits);await button('Odrzuć czasy').click();assert.deepEqual((await save()).captionEdits,baseline.captionEdits);
 // A source changed after recognition is refused again at deliberate Apply.
 await analyze();const stamp=fs.statSync(source);fs.utimesSync(source,stamp.atime,new Date(stamp.mtimeMs+2000));await button('Zastosuj czasy słów').click();await page.getByRole('alert').filter({hasText:'Plik zmienił'}).waitFor();assert.deepEqual((await save()).captionEdits,baseline.captionEdits);await button('Odrzuć czasy').click();fs.utimesSync(source,stamp.atime,stamp.mtime);
 await analyze();await button('Zastosuj czasy słów').click();await page.waitForFunction(()=>document.querySelector('.caption-timing-status')?.dataset.timing==='reanalyzed');const matched=await save();assert.equal(matched.captionEdits['timeline:correction'].textTiming.mode,'reanalyzed');assert.deepEqual(matched.timelineSegments,real.timelineSegments);assert.deepEqual(matched.clips,real.clips);
 await page.locator('.header-save').focus();await page.keyboard.press('Control+z');assert.equal(await status().getAttribute('data-timing'),'board');await page.keyboard.press('Control+y');assert.equal(await status().getAttribute('data-timing'),'reanalyzed');await save();
 await seek.fill('2');await page.waitForFunction(()=>document.querySelector('.animated-caption-canvas')?.dataset.fallback==='false');await page.screenshot({path:'.tools/caption035b-real-polish.png'});await exportMp4('reanalyzed-polish');
 await text().fill(actual+' nigdy');await text().press('Control+Enter');const changed=await save();await button('Dopasuj do nagrania').click();await page.getByRole('alert').filter({hasText:'inną treść'}).waitFor({timeout:90000});assert.equal(await page.locator('.caption-word-table').count(),0);assert.deepEqual((await save()).captionEdits,changed.captionEdits);
 console.log('0.35b native: insertion anchors/empty unknown times, manual validation/review/discard/one Undo/Redo/reopen/lock/preview/MP4; real Polish human speech + actual whisper.cpp short reanalysis, cancel, explicit proposal, source-stamp refusal, separate Apply/Undo, real Polish MP4 and absent-word rejection: OK');
}
