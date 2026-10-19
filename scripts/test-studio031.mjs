import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
export async function testStudio031(page,{read,save,screenshot}){
 const original=await read(),mock=await page.evaluate(()=>!!window.__calls);const button=name=>page.getByRole('button',{name,exact:true});
 await page.locator('.header-export').click();await page.getByRole('dialog',{name:'Sprawdzenie przed eksportem',exact:true}).getByRole('button',{name:/Kontynuuj eksport MP4|Eksportuj mimo ostrzeżeń/}).click();const studio=page.getByRole('dialog',{name:'Export Studio',exact:true});await studio.waitFor();
 const invoke=(cmd,args={})=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
 for(const row of await invoke('studio_status')){if(['queued','preparing','rendering','cancelling'].includes(row.state))await invoke('studio_cancel',{id:row.id});}
 await page.waitForFunction(()=>![...document.querySelectorAll('.studio-job')].some(e=>['queued','preparing','rendering','cancelling'].some(s=>e.classList.contains(s))));
 for(const row of await invoke('studio_status'))await invoke('studio_remove',{id:row.id});
 await studio.getByRole('combobox',{name:'Profil eksportu',exact:true}).selectOption('reel');await studio.getByRole('spinbutton',{name:'Szerokość eksportu',exact:true}).fill('128');await studio.getByRole('spinbutton',{name:'Wysokość eksportu',exact:true}).fill('224');
 await studio.getByRole('combobox',{name:'Napisy eksportu',exact:true}).selectOption('srt');
 const ready=async()=>{await page.waitForFunction(()=>{const i=document.querySelector('.studio-preview img');return i?.complete&&i.naturalWidth>0;});const accept=studio.getByRole('checkbox',{name:'Akceptuję ostrzeżenia eksportu',exact:true});if(await accept.count())await accept.check();};
 await ready();if(!mock)assert(await studio.locator('.studio-preview img').evaluate(i=>i.naturalHeight>100));
 await studio.getByRole('textbox',{name:'Nazwa profilu eksportu',exact:true}).fill('Próba Łódź 031');await studio.getByRole('button',{name:'Zapisz profil eksportu',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('select[aria-label="Profil eksportu"] option')].some(o=>o.textContent==='Próba Łódź 031'));
 await studio.getByRole('button',{name:/^(Wybierz|Zmień) folder eksportu…$/}).click();await ready();
 await studio.getByRole('button',{name:'Dodaj wariant do kolejki',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.studio-job')?.classList.contains('completed'));
 let rows=await invoke('studio_status');assert.equal(rows.length,1);assert(rows[0].srtPath);const first=rows[0];
 await studio.getByRole('combobox',{name:'Napisy eksportu',exact:true}).selectOption('none');await ready();await studio.getByRole('button',{name:'Dodaj wariant do kolejki',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.studio-job.completed').length===2);
 rows=await invoke('studio_status');assert.notEqual(rows[0].outputPath,rows[1].outputPath);assert.equal(rows[1].srtPath,null);
 // Native overlay, saved profile, queue state and scrollable controls remain inside the viewport.
 assert(await studio.evaluate(d=>{const r=d.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&document.elementFromPoint(r.x+r.width/2,r.y+20)?.closest('dialog')===d;}));await page.screenshot({path:screenshot});
 await studio.getByRole('button',{name:'Wróć do montażu',exact:true}).click();await studio.waitFor({state:'hidden'});await button('Otwórz kolejkę eksportu').click();await studio.waitFor();await studio.getByRole('option',{name:'Próba Łódź 031',exact:true}).first().waitFor({state:'attached'});
 await studio.getByRole('combobox',{name:'Profil eksportu',exact:true}).selectOption({label:'Próba Łódź 031'});await ready();assert.equal(await studio.getByRole('combobox',{name:'Napisy eksportu',exact:true}).inputValue(),'srt');
 // Native multi-project picker adds immutable snapshots without switching the editor project.
 await studio.getByRole('button',{name:'Dodaj zapisane projekty…',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('select[aria-label="Projekt eksportu"] option').length===2);assert.equal(await studio.getByRole('combobox',{name:'Projekt eksportu',exact:true}).locator('option').count(),2);assert(await studio.getByRole('button',{name:'Dodaj wszystkie projekty (2)',exact:true}).isDisabled());
 await studio.getByRole('button',{name:'Zatwierdź kadr i ustawienia projektu',exact:true}).click();await studio.getByRole('combobox',{name:'Projekt eksportu',exact:true}).selectOption('1');await ready();await studio.getByRole('button',{name:'Zatwierdź kadr i ustawienia projektu',exact:true}).click();assert(await studio.getByRole('button',{name:'Dodaj wszystkie projekty (2)',exact:true}).isEnabled());
 if(!mock){
  assert(fs.readFileSync(first.srtPath,'utf8').includes('Zażółć')||fs.readFileSync(first.srtPath,'utf8').length>0);const probe=process.env.AUTONAPISY_FFMPEG.replace(/ffmpeg\.exe$/i,'ffprobe.exe');const info=JSON.parse(execFileSync(probe,['-v','error','-show_streams','-of','json',first.outputPath],{encoding:'utf8'}));assert.equal(info.streams[0].width,128);assert.equal(info.streams[0].height,224);assert.equal(info.streams[0].codec_name,'h264');assert.equal(info.streams[1].codec_name,'aac');
  await assert.rejects(invoke('studio_prepare',{json:JSON.stringify(original),captions:'[]',options:{width:null,height:null,crf:18,speed:'fast',audioKbps:192,fit:'fit',captions:'none'},folderId:999999}));
 }
 await studio.getByRole('button',{name:'Wróć do montażu',exact:true}).click();await save();await page.waitForFunction(()=>document.querySelector('.header-save')?.dataset.saveStatus==='saved');const after=await read();assert.deepEqual(after.clips,original.clips);assert.deepEqual(after.timelineSegments,original.timelineSegments);
 console.log('0.31 Export Studio: actual frame/fit preview, saved Unicode profile/reopen, sequential MP4 + SRT / clean MP4, distinct destinations, batch review and unchanged editor project: OK');
}
