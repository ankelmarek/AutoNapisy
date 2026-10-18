import assert from 'node:assert/strict';
export async function testTracks022(page,save,read,screenshot){
 const button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>!document.querySelector('.header-project-name')?.disabled);
 const checkpoint=async()=>{await ready();await save();await ready();return read();};
 await ready();await page.getByRole('tab',{name:/Pliki/}).click();
 const before=await checkpoint();assert.equal(before.trackLayout.filter(t=>t.kind==='video').length,2);
 await button('Dodaj ścieżkę wideo').click();let p=await checkpoint();assert(p.trackLayout.some(t=>t.id==='V3'));assert(!p.trackLayout.some(t=>t.id==='A3'));
 await button('Dodaj ścieżkę audio').click();p=await checkpoint();assert(p.trackLayout.some(t=>t.id==='A3'));
 const body=page.locator('.timeline-body');await body.evaluate(el=>el.scrollTop=0);
 const top=await page.locator('[data-lane-id="V3"]').evaluate(el=>Number.parseFloat(el.style.top));
 await page.locator('.library-file').first().dragTo(page.locator('.edit-canvas'),{targetPosition:{x:30,y:top+12}});
 p=await checkpoint();const clip=p.clips.find(c=>c.kind!=='audio'&&c.track===2);assert(clip,'Real drag must land on V3');assert.equal(clip.audioRoute,'embedded');assert.equal(p.clips.length,before.clips.length+1);
 const selected=page.locator(`.edit-clip[data-clip-id="${clip.id}"]:not(.audio-clip)`);await selected.focus();await button('Film / audio').click();
 assert.equal(await page.getByRole('combobox',{name:'Trasowanie dźwięku',exact:true}).inputValue(),'embedded');
 // Lock and R are editing controls; they must not restart the decoder.
 await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2);const stream=await page.locator('video.mlt-video').getAttribute('src');
 await button('Blokada V3').click();assert((await selected.getAttribute('class')).includes('clip-is-locked'));await page.waitForTimeout(250);assert.equal(await page.locator('video.mlt-video').getAttribute('src'),stream);await button('Blokada V3').click();
 await button('Ustawienia ścieżki V3').click();await page.getByRole('combobox',{name:'Uwzględniaj w dosuwaniu V3',exact:true}).selectOption('on');await page.waitForTimeout(100);assert.equal(await page.locator('video.mlt-video').getAttribute('src'),stream);await page.getByRole('combobox',{name:'Uwzględniaj w dosuwaniu V3',exact:true}).selectOption('auto');await page.locator('.track-settings-menu').getByRole('button',{name:'Zamknij',exact:true}).click();
 await button('Ukryj V3').click();await page.waitForFunction(before=>{const v=document.querySelector('video.mlt-video');return v?.readyState>=2&&v.getAttribute('src')!==before;},stream);assert((await selected.getAttribute('class')).includes('track-is-hidden'));await button('Ukryj V3').click();
 await button('Wycisz V3').click();assert.equal(await button('Wycisz V3').getAttribute('aria-pressed'),'true');await button('Wycisz V3').click();
 await button('Zwiń V3').click();assert.equal(await page.locator('[data-lane-id="V3"]').evaluate(el=>el.getBoundingClientRect().height),28);await button('Zwiń V3').click();
 await button('Wysokość A3').click();assert.equal(await page.locator('[data-lane-id="A3"]').evaluate(el=>el.getBoundingClientRect().height),112);await button('Wysokość A3').click();
 await selected.focus();await button('Film / audio').click();await button('Odłącz audio → A3').click();p=await checkpoint();assert(p.clips.find(c=>c.id===clip.id).audioDetached);const detached=p.clips.find(c=>c.kind==='audio'&&c.track===2&&c.syncGroup===p.clips.find(c=>c.id===clip.id).syncGroup);assert(detached);assert.equal(detached.start,clip.start);assert.equal(detached.sourceIn,clip.sourceIn);
 await page.keyboard.press('Control+z');p=await checkpoint();assert(!p.clips.find(c=>c.id===clip.id).audioDetached);assert(!p.clips.some(c=>c.id===detached.id));
 // No silent deletion: explicitly cancel first, then approve and verify single Undo.
 page.removeAllListeners('dialog');let decision=page.waitForEvent('dialog').then(d=>d.dismiss());await Promise.all([button('Usuń ścieżkę V3').click(),decision]);p=await checkpoint();assert(p.trackLayout.some(t=>t.id==='V3'));
 decision=page.waitForEvent('dialog').then(d=>d.accept());await Promise.all([button('Usuń ścieżkę V3').click(),decision]);p=await checkpoint();assert(!p.trackLayout.some(t=>t.id==='V3'));assert(!p.clips.some(c=>c.id===clip.id));await page.keyboard.press('Control+z');p=await checkpoint();assert(p.trackLayout.some(t=>t.id==='V3'));assert(p.clips.some(c=>c.id===clip.id));page.on('dialog',d=>d.accept());
 await page.getByRole('slider',{name:'Pozycja odtwarzania',exact:true}).fill(String(clip.start+.5));await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.readyState>=2&&!document.querySelector('video.mlt-video').seeking);await button('Odtwórz film').click();await page.waitForFunction(()=>document.querySelector('video.mlt-video')?.currentTime>.15);await button('Wstrzymaj odtwarzanie').click();
 const pixels=await page.locator('video.mlt-video').evaluate(v=>{const c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d');x.drawImage(v,0,0,16,16);return [...x.getImageData(0,0,16,16).data].some((value,i)=>i%4!==3&&value>35);});assert(pixels,'V3 must decode actual non-black pixels after Undo');
 if((await page.viewportSize())?.height>900){await page.getByRole('separator',{name:'Wysokość osi czasu',exact:true}).focus();for(let i=0;i<4;i++)await page.keyboard.press('Shift+ArrowUp');}
 await body.evaluate(el=>el.scrollTop=0);await page.screenshot({path:screenshot});console.log('0.22 dynamic V3/A3: separate add, actual drop, embedded routing, lock/R without decoder restart, mute/eye, collapse/height, detach A3, cancel/confirm removal and Undo: OK');
}
