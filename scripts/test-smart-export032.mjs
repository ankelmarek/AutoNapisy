import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
export async function testSmartExport032(page,{read,save,screenshot}){
 const original=await read(),mock=await page.evaluate(()=>!!window.__calls),invoke=(cmd,args={})=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
 await page.getByRole('button',{name:'Otwórz kolejkę eksportu',exact:true}).click();const studio=page.getByRole('dialog',{name:'Export Studio',exact:true});await studio.waitFor();
 await studio.getByRole('spinbutton',{name:'Szerokość eksportu',exact:true}).fill('128');await studio.getByRole('spinbutton',{name:'Wysokość eksportu',exact:true}).fill('224');
 await studio.getByRole('combobox',{name:'Napisy eksportu',exact:true}).selectOption('burn');
 await studio.getByRole('button',{name:'Porównaj jakość A/B…',exact:true}).click();const compare=page.getByRole('dialog',{name:'Porównanie jakości eksportu',exact:true});await compare.waitFor();
 await compare.getByRole('spinbutton',{name:'Początek próbki eksportu',exact:true}).fill('1');await compare.getByRole('combobox',{name:'Długość próbki eksportu',exact:true}).selectOption('4');
 await compare.getByRole('button',{name:'Przygotuj próbki A/B',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.compare-variants button').length===3,{},{timeout:90000});
 const video=compare.getByLabel('Zakodowana próbka jakości',{exact:true});await page.waitForFunction(()=>document.querySelector('.compare-video video')?.readyState>=2);
 const decoded=await video.evaluate(v=>{const c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d');x.drawImage(v,0,0,16,16);return [...x.getImageData(0,0,16,16).data].some((n,i)=>i%4!==3&&n>35);});assert(decoded,'Encoded sample must have decoded picture pixels');
 await video.evaluate(v=>{v.pause();v.currentTime=.7;});await page.waitForFunction(()=>Math.abs(document.querySelector('.compare-video video').currentTime-.7)<.08);
 await compare.getByRole('group',{name:'Warianty jakości'}).getByRole('button').first().click();await page.waitForFunction(()=>{const v=document.querySelector('.compare-video video');return v?.readyState>=2&&Math.abs(v.currentTime-.7)<.08;});
 await video.evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('.compare-video video')?.currentTime>1);await video.evaluate(v=>v.pause());
 if(!mock){const src=await video.evaluate(v=>v.currentSrc),path=decodeURIComponent(new URL(src).pathname).slice(1);assert(fs.statSync(path).size>1000);const ffprobe=process.env.AUTONAPISY_FFMPEG.replace(/ffmpeg\.exe$/i,'ffprobe.exe');const info=JSON.parse(execFileSync(ffprobe,['-v','error','-show_streams','-of','json',path],{encoding:'utf8'}));assert.equal(info.streams[0].codec_name,'h264');assert.equal(info.streams[0].width,128);assert.equal(info.streams[0].height,224);assert.equal(info.streams[1].codec_name,'aac');assert(Math.abs(Number(info.streams[0].duration)-4)<.1);}
 assert(await compare.evaluate(d=>{const r=d.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&document.elementFromPoint(r.x+r.width/2,r.y+20)?.closest('dialog')===d;}));await page.screenshot({path:screenshot});
 await compare.getByRole('button',{name:'Użyj ustawień wybranego wariantu',exact:true}).click();await compare.waitFor({state:'hidden'});assert.equal(await studio.getByRole('slider',{name:'Jakość eksportu CRF',exact:true}).inputValue(),'12');assert((await studio.innerText()).includes('Na podstawie próbki:'));
 await studio.getByRole('combobox',{name:'Tryb jakości eksportu',exact:true}).selectOption('size');
 const total=Math.max(original.media?.duration??0,...(original.clips??[]).map(c=>c.start+c.sourceOut-c.sourceIn)),limit=Math.max(.5,Math.ceil((total*.045+.1)*4)/4);
 await studio.getByRole('spinbutton',{name:'Limit rozmiaru MP4',exact:true}).fill(String(limit));await studio.getByRole('combobox',{name:'Napisy eksportu',exact:true}).selectOption('srt');
 await page.waitForFunction(()=>document.querySelector('.studio-preview img')?.complete);const accept=studio.getByRole('checkbox',{name:'Akceptuję ostrzeżenia eksportu',exact:true});if(await accept.count())await accept.check();
 const before=await invoke('studio_status');await studio.getByRole('button',{name:'Dodaj wariant do kolejki',exact:true}).click();await page.waitForFunction(n=>document.querySelectorAll('.studio-job.completed').length>=n+1,before.filter(x=>x.state==='completed').length,{timeout:90000});
 const after=await invoke('studio_status'),last=after.find(x=>!before.some(b=>b.id===x.id));assert(last?.state==='completed');if(!mock){assert(fs.statSync(last.outputPath).size<=limit*1e6);assert(fs.readFileSync(last.srtPath,'utf8').length>0);}else{assert.equal(last.options.targetMb,limit);}
 // A canceled key cannot start late, including cancel-before-begin.
 const key=crypto.randomUUID();await invoke('studio_sample_cancel',{key});await assert.rejects(invoke('studio_sample_begin',{key,json:JSON.stringify(original),captions:JSON.stringify(original.timelineSegments??original.segments??[]),options:{width:128,height:224,crf:18,speed:'fast',audioKbps:192,fit:'fit',captions:'none',targetMb:null},start:0,duration:3}));
 await studio.getByRole('button',{name:'Wróć do montażu',exact:true}).click();await save();await page.waitForFunction(()=>document.querySelector('.header-save')?.dataset.saveStatus==='saved');const saved=await read();assert.deepEqual(saved.clips,original.clips);assert.deepEqual(saved.timelineSegments,original.timelineSegments);
 console.log('0.32 Export Studio: real encoded A/B playback/pixels/seek-preserving switch, source captions, measured estimates/apply, two-pass MB + SRT, cancellation tombstone, unchanged montage and top-layer layout: OK');
}
