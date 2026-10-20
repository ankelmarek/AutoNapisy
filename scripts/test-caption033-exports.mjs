import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
export async function testCaption033Exports(page,projectPath){
 const ff=process.env.AUTONAPISY_FFMPEG,probe=ff.replace(/ffmpeg\.exe$/i,'ffprobe.exe'),button=name=>page.getByRole('button',{name,exact:true}),invoke=(cmd,args={})=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
 const cdp=await page.context().newCDPSession(page);
 const before=JSON.parse(fs.readFileSync(projectPath,'utf8'));
 // An unapplied local style draft belongs to the current Open/New session, even
 // when two project files have the same createdAt and caption IDs.
 await button('Napisy').click();await page.locator('[data-caption-preset="neon"]').click();assert(await page.getByRole('button',{name:/^Zastosuj styl/}).isEnabled());
 const other={...before,name:before.name+' — statyczny',styles:Object.fromEntries(Object.entries(before.styles).map(([id,style])=>{const copy={...style};delete copy.animation;return[id,copy];}))};
 fs.writeFileSync(projectPath,JSON.stringify(other));await page.keyboard.press('Control+o');await page.waitForFunction(name=>document.querySelector('.header-project-name')?.textContent.trim()===name&&!document.querySelector('.header-project-name').disabled,other.name);
 assert.equal(await page.locator('[data-caption-preset][aria-pressed="true"]').count(),0);assert(await page.getByRole('button',{name:/^Zastosuj styl/}).isDisabled());
 fs.writeFileSync(projectPath,JSON.stringify(before));await page.keyboard.press('Control+o');await page.waitForFunction(name=>document.querySelector('.header-project-name')?.textContent.trim()===name&&!document.querySelector('.header-project-name').disabled,before.name);

 const save=async()=>{await page.locator('.header-save').click();await page.waitForFunction(()=>document.querySelector('.header-save')?.dataset.saveStatus==='saved'&&!document.querySelector('.header-save').disabled);};
 const frames=(file,n)=>execFileSync(ff,['-v','error','-i',file,'-vf',`select=eq(n\\,${n})`,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{maxBuffer:16e6});
 const bright=bytes=>{let count=0;for(let i=0;i<bytes.length;i+=3)if(bytes[i]>180&&bytes[i+1]>180&&bytes[i+2]>180)count++;return count;};
 const accent=(bytes,width=320)=>{let count=0,sum=0;for(let i=0;i<bytes.length;i+=3)if(bytes[i]>140&&bytes[i+1]>150&&bytes[i+2]<140){count++;sum+=(i/3)%width;}return{count,x:sum/Math.max(1,count)};};
 let lastPath;
 for(const preset of ['karaoke-flow','pop-beat','editorial','classic-yellow','classic-outline','motion-off']){
  await button('Napisy').click();await page.getByRole('combobox',{name:'Zakres stylu napisów',exact:true}).selectOption('all');await page.getByRole('tab',{name:'Style napisów',exact:true}).click();await page.locator(`[data-caption-preset="${preset==='motion-off'?'type-flow':preset}"]`).click();
  if(preset==='motion-off'){await page.getByRole('tab',{name:'Opcje napisów',exact:true}).click();await page.getByRole('switch',{name:'Animacja napisów',exact:true}).uncheck();await button('Zastosuj zmiany (2)').click();await page.getByRole('tab',{name:'Style napisów',exact:true}).click();}else await button('Zastosuj styl (2)').click();await save();
  await page.locator('.header-export').click();const pre=page.getByRole('dialog',{name:'Sprawdzenie przed eksportem',exact:true});await pre.getByRole('button',{name:/Kontynuuj eksport MP4|Eksportuj mimo ostrzeżeń/}).click();const studio=page.getByRole('dialog',{name:'Export Studio',exact:true});await studio.waitFor();
  if(preset==='karaoke-flow'){for(const r of await invoke('studio_status')){if(['queued','preparing','rendering','cancelling'].includes(r.state))await invoke('studio_cancel',{id:r.id});}for(const r of await invoke('studio_status'))await invoke('studio_remove',{id:r.id});}
  await studio.getByRole('combobox',{name:'Profil eksportu',exact:true}).selectOption('reel');await studio.getByRole('spinbutton',{name:'Szerokość eksportu',exact:true}).fill(preset==='karaoke-flow'?'1080':'320');await studio.getByRole('spinbutton',{name:'Wysokość eksportu',exact:true}).fill(preset==='karaoke-flow'?'1920':'568');await studio.getByRole('combobox',{name:'Napisy eksportu',exact:true}).selectOption('burn');
  const ready=async()=>{await page.waitForFunction(()=>{const i=document.querySelector('.studio-preview img');return i?.complete&&i.naturalWidth>0;});const accept=studio.getByRole('checkbox',{name:'Akceptuję ostrzeżenia eksportu',exact:true});if(await accept.count())await accept.check();};await ready();
  await studio.getByRole('button',{name:/^(Wybierz|Zmień) folder eksportu…$/}).click();await ready();
  const rows=await invoke('studio_status'),began=performance.now(),memoryBase=await cdp.send('Runtime.getHeapUsage');let peakMemory=memoryBase.usedSize+(memoryBase.backingStorageSize??0),pendingMemory=null;
  const memoryTimer=setInterval(()=>{if(!pendingMemory)pendingMemory=cdp.send('Runtime.getHeapUsage').then(m=>{peakMemory=Math.max(peakMemory,m.usedSize+(m.backingStorageSize??0));}).catch(()=>{}).finally(()=>{pendingMemory=null;});},200);
  try{await studio.getByRole('button',{name:'Dodaj wariant do kolejki',exact:true}).click();await page.waitForFunction(n=>document.querySelectorAll('.studio-job.completed').length===n+1,rows.length,{timeout:180000});}
  finally{clearInterval(memoryTimer);if(pendingMemory)await pendingMemory;}
  const memoryDelta=Math.max(0,peakMemory-memoryBase.usedSize-(memoryBase.backingStorageSize??0));assert(memoryDelta<512*1024*1024,'Caption upload retains too many JS/ArrayBuffer frames');console.log(JSON.stringify({productionCaption:preset,uiSeconds:(performance.now()-began)/1000,webviewJsAndBuffersDelta:memoryDelta,backingStorageMeasured:memoryBase.backingStorageSize!==undefined}));
  const after=await invoke('studio_status'),result=after.find(r=>!rows.some(b=>b.id===r.id));assert.equal(result.state,'completed',result.message);lastPath=result.outputPath;fs.copyFileSync(lastPath,`.tools/caption033-production-${preset}.mp4`);
  const info=JSON.parse(execFileSync(probe,['-v','error','-show_streams','-of','json',lastPath],{encoding:'utf8'}));assert.equal(info.streams[0].width,preset==='karaoke-flow'?1080:320);assert.equal(info.streams[0].height,preset==='karaoke-flow'?1920:568);assert.equal(info.streams[0].codec_name,'h264');assert.equal(info.streams[0].avg_frame_rate,'30/1');assert.equal(info.streams[0].nb_frames,'110');assert.equal(info.streams[1].codec_name,'aac');
  if(preset==='karaoke-flow'){const a=accent(frames(lastPath,6),1080),b=accent(frames(lastPath,24),1080);assert(a.count>15&&b.count>15);assert(Math.abs(a.x-b.x)>5,'Production MP4 karaoke highlight must follow real words');}
  if(preset==='karaoke-flow'){
   const existing=await invoke('studio_status');await studio.getByRole('button',{name:'Dodaj wariant do kolejki',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.studio-dialog p[role=status]')].some(p=>/napisy [1-9]\d*%/.test(p.textContent)),{},{timeout:30000});
   const cancelAt=performance.now();await studio.getByRole('button',{name:'Przerwij dodawanie',exact:true}).click();await page.waitForFunction(()=>![...document.querySelectorAll('.studio-dialog p[role=status]')].some(p=>p.textContent.includes('Przygotowywanie:')),{},{timeout:10000});const cancelled=(await invoke('studio_status')).find(r=>!existing.some(b=>b.id===r.id));assert.equal(cancelled?.state,'cancelled');assert(!fs.existsSync(cancelled.outputPath));await invoke('studio_remove',{id:cancelled.id});console.log(JSON.stringify({productionCaptionCancel:'1080x1920',seconds:(performance.now()-cancelAt)/1000}));
  }
  if(['classic-yellow','classic-outline','motion-off'].includes(preset)){
   const a=frames(lastPath,6),b=frames(lastPath,24);let error=0;for(let i=0;i<a.length;i++)error+=Math.abs(a[i]-b[i]);assert(error/a.length<1,'Static or motion-Off MP4 changes at word boundaries');
   if(preset==='classic-yellow')assert(accent(a).count>1000,'Yellow classic tile did not produce the traditional yellow board');else assert(bright(a)>40,'Static caption text is missing');
  }
  if(preset==='pop-beat'){const small=accent(frames(lastPath,3)),large=accent(frames(lastPath,6));assert(large.count>small.count*1.15,'Production Pop must have actual scaled word pixels');}
  if(preset==='editorial'){
   assert(bright(frames(lastPath,9))>bright(frames(lastPath,1))+30,'Editorial entry must actually fade in');
   await studio.getByRole('button',{name:'Porównaj jakość A/B…',exact:true}).click();const compare=page.getByRole('dialog',{name:'Porównanie jakości eksportu',exact:true});await compare.waitFor();await compare.getByRole('combobox',{name:'Długość próbki eksportu',exact:true}).selectOption('3');await compare.getByRole('spinbutton',{name:'Początek próbki eksportu',exact:true}).fill(String(10/30));await compare.getByRole('button',{name:'Przygotuj próbki A/B',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.compare-variants button').length===3,{},{timeout:90000});
   const video=compare.getByLabel('Zakodowana próbka jakości',{exact:true});await page.waitForFunction(()=>document.querySelector('.compare-video video')?.readyState>=2);await video.evaluate(v=>{v.pause();v.currentTime=.7;});await page.waitForFunction(()=>Math.abs(document.querySelector('.compare-video video').currentTime-.7)<.08);
   // Same global frame in the entire export and a nonzero A/B range.
   for(let index=0;index<3;index++){await compare.getByRole('group',{name:'Warianty jakości'}).getByRole('button').nth(index).click();await page.waitForFunction(()=>{const v=document.querySelector('.compare-video video');return v?.readyState>=2&&Math.abs(v.currentTime-.7)<.08;});const file=await video.evaluate(v=>decodeURIComponent(new URL(v.currentSrc).pathname).slice(1));const full=frames(lastPath,31),sample=frames(file,21);assert.equal(full.length,sample.length);let sum=0;for(let i=0;i<full.length;i++)sum+=Math.abs(full[i]-sample[i]);assert(sum/full.length<3,'A/B animation uses a different montage time');fs.copyFileSync(file,`.tools/caption033-production-ab-${index}.mp4`);}
   await video.evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('.compare-video video')?.currentTime>1);await video.evaluate(v=>v.pause());await page.screenshot({path:'.tools/caption033-production-ab.png'});await compare.getByRole('button',{name:'Wróć do Export Studio',exact:true}).click();
  }
  await studio.getByRole('button',{name:'Wróć do montażu',exact:true}).click();
 }
 await save();const after=JSON.parse(fs.readFileSync(projectPath,'utf8'));assert.deepEqual(after.clips,before.clips);assert.deepEqual(after.timelineSegments,before.timelineSegments);assert.deepEqual(after.masterAudio,before.masterAudio);await cdp.detach();console.log('0.33c actual product UI: Karaoke/Pop/Editorial + both classic factories + motion Off through queue, real changing caption pixels/30FPS/AAC, three A/B variants with nonzero global timing, play/seek and unchanged text/audio: OK');
}
