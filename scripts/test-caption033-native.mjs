import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

export async function testCaption033(page,projectPath){
 const ff=process.env.AUTONAPISY_FFMPEG,probe=ff.replace(/ffmpeg\.exe$/i,'ffprobe.exe'),manual=fs.readFileSync(projectPath),p=JSON.parse(manual),root=page.url().split('?')[0],source=path.join(path.dirname(projectPath),'Animated Captions mowa Łódź.mp4');
 const recognized=JSON.parse(fs.readFileSync('tests/fixtures/caption033-words.json','utf8'));
 execFileSync(ff,['-v','error','-y','-f','lavfi','-i','color=c=0x243247:s=320x568:r=30:d=4','-i','tests/fixtures/caption033-speech.wav','-c:v','libx264','-preset','fast','-pix_fmt','yuv420p','-c:a','aac','-shortest',source]);
 const seed={...p,schemaVersion:15,name:'POC 0.33a — prawdziwe czasy Whisper',canvas:{width:320,height:568},media:{path:source,name:path.basename(source),duration:4},assets:[],segments:recognized,timelineSegments:null,captionEdits:{},transitions:[],tracks:{},masterAudio:{gainDb:-3},clips:[{id:'poc',kind:'video',start:0,sourceIn:1/3,sourceOut:4,volume:.7,audioRoute:'embedded'}]};
 const invoke=(cmd,args={})=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
 try{
  // Authorize the generated fixture through the real native Open command, never by arbitrary path IPC.
  fs.writeFileSync(projectPath,JSON.stringify(seed));await invoke('open_project');await page.goto(root+'?caption-poc');await page.getByRole('main',{name:'Test techniczny animowanych napisów'}).waitFor();
  await page.getByRole('textbox',{name:'Projekt testowy napisów',exact:true}).fill(JSON.stringify(seed));
  for(const preset of ['karaoke-flow','pop-beat']){
   await page.getByRole('combobox',{name:'Preset testu animacji',exact:true}).selectOption(preset);await page.getByRole('button',{name:'Renderuj testowy MP4',exact:true}).click();
   await page.waitForFunction(()=>!!document.querySelector('[data-poc-output]'),{},{timeout:90000});
   const output=await page.locator('[data-poc-output]').getAttribute('data-poc-output'),work=path.dirname(path.dirname(output)),layer=path.join(work,'animated-layer.mkv'),composition=path.join(work,'source','composition.mkv');
   const info=JSON.parse(execFileSync(probe,['-v','error','-show_streams','-of','json',output],{encoding:'utf8'}));assert.equal(info.streams[0].codec_name,'h264');assert.equal(info.streams[0].avg_frame_rate,'30/1');assert.equal(info.streams[1].codec_name,'aac');assert.equal(info.streams[0].nb_frames,'110');
   const canvas=page.getByLabel('Referencyjna klatka napisów',{exact:true}),video=page.getByLabel('Animowane napisy w MP4',{exact:true});await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);await video.evaluate(v=>v.pause());
   const hashes=[];
   for(const n of [0,2,12,14,19,21,39,40,89,108]){
    await page.getByRole('spinbutton',{name:'Klatka testu animacji',exact:true}).fill(String(n));await page.waitForFunction(n=>document.querySelector('canvas')?.dataset.frame===String(n),n);
    const hash=await canvas.evaluate(async c=>{const bytes=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');});
    const rgba=execFileSync(ff,['-v','error','-i',layer,'-vf',`select=eq(n\\,${n})`,'-frames:v','1','-pix_fmt','rgba','-f','rawvideo','pipe:1'],{maxBuffer:4e6});
    assert.equal(crypto.createHash('sha256').update(rgba).digest('hex'),hash,`${preset} layer differs from shared renderer at frame ${n}`);hashes.push(hash);
    const expected=execFileSync(ff,['-v','error','-i',composition,'-i',layer,'-filter_complex',`[0:v][1:v]overlay=0:0:eof_action=pass:repeatlast=0,format=yuv420p,select=eq(n\\,${n})`,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{maxBuffer:4e6});
    const actual=execFileSync(ff,['-v','error','-i',output,'-vf',`select=eq(n\\,${n})`,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{maxBuffer:4e6});assert.equal(actual.length,expected.length);let error=0;for(let i=0;i<actual.length;i++)error+=Math.abs(actual[i]-expected[i]);assert(error/actual.length<3,`${preset} H264 differs at ${n}: ${error/actual.length}`);
   }
   assert(new Set(hashes).size>=4,'Real caption pixels must move/change at word boundaries');
   await page.getByRole('spinbutton',{name:'Klatka testu animacji',exact:true}).fill('21');await page.screenshot({path:`.tools/caption033-${preset}.png`});
   fs.copyFileSync(output,`.tools/caption033-${preset}.mp4`);await video.evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('video')?.currentTime>1);await video.evaluate(v=>{v.pause();v.removeAttribute('src');v.load();});
   await page.getByRole('button',{name:'Anuluj test',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('video')?.currentSrc);for(let i=0;i<50&&fs.existsSync(work);i++)await page.waitForTimeout(100);assert(!fs.existsSync(work),'Session must reap and clean its files');
  }
  // A hand-edited phrase with stale word times is a visible whole-card fallback.
  const fallback={...seed,segments:recognized.map(s=>({...s,text:'Zażółć gęślą jaźń — ręczna zmiana'}))};await page.getByRole('textbox',{name:'Projekt testowy napisów',exact:true}).fill(JSON.stringify(fallback));await page.getByRole('button',{name:'Renderuj testowy MP4',exact:true}).click();await page.waitForFunction(()=>!!document.querySelector('[data-poc-output]'),{},{timeout:90000});await page.getByText('Brak synchronizacji słów — użyto animacji planszy.',{exact:true}).waitFor();await page.getByRole('button',{name:'Anuluj test',exact:true}).click();
  console.log('0.33a real spoken fixture + actual Whisper offsets: Karaoke/Pop binary stream, lossless alpha pixel hashes at 20 frames, encoded H264/30FPS + AAC, seek/play, honest Polish manual fallback and cleanup: OK');
 }finally{
  fs.writeFileSync(projectPath,manual);await page.goto(root);await page.waitForFunction(()=>document.querySelector('dialog[open]')||document.querySelector('.start-screen')||document.querySelector('.header-project-name')&&!document.querySelector('.header-project-name').disabled);const recovery=page.getByRole('dialog',{name:'Odzyskaj pracę',exact:true});if(await recovery.isVisible())await recovery.getByRole('button',{name:'Otwórz zapisany projekt',exact:true}).click();
  const home=page.getByRole('main',{name:'Ekran startowy',exact:true});if(await home.isVisible())await home.getByRole('button',{name:'Otwórz projekt',exact:true}).click();else await page.keyboard.press('Control+o');await page.waitForFunction(()=>document.querySelector('.header-save')?.dataset.saveStatus==='saved'&&!document.querySelector('.header-project-name')?.disabled);
 }
}
