import {chromium} from 'playwright-core';
import fs from 'node:fs';
const browser=await chromium.connectOverCDP(process.env.ROLVIXA_WEBVIEW_CDP),page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(20000);page.on('console',m=>console.log('WebView:',m.type(),m.text()));page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
try{
 await page.waitForURL(/tauri\.localhost|^tauri:/);await page.locator('.project-menu summary').click();await page.locator('.project-menu-popup').getByRole('button',{name:'Otwórz',exact:true}).click();await page.waitForSelector('.library-file');
 const project=JSON.parse(fs.readFileSync(process.env.ROLVIXA_TEST_PROJECT,'utf8'));console.log('Direct native thumbnail:',await page.evaluate(async path=>{try{const data=await window.__TAURI_INTERNALS__.invoke('source_thumbnail',{path,time:.2});return {ok:true,length:data.length,prefix:data.slice(0,24)};}catch(e){return {error:String(e)};}},project.media.path));
 await page.waitForTimeout(1500);console.log('Thumbnail DOM:',await page.locator('.thumbnail-wrap').first().evaluate(el=>({html:el.outerHTML.slice(0,5000),rect:el.getBoundingClientRect().toJSON(),child:el.querySelector('.media-thumbnail')?.getBoundingClientRect().toJSON(),button:el.querySelector('button')?.getBoundingClientRect().toJSON()})));
 await page.getByRole('button',{name:/Podgląd źródła:/}).first().click();await page.waitForTimeout(5000);console.log('Source video:',await page.locator('.source-stage video').evaluate(v=>({ready:v.readyState,error:v.error?.message,src:v.currentSrc})));console.log('Footer:',await page.locator('footer').textContent());
}finally{await page.screenshot({path:'.tools/thumbnail-diagnostic.png'});await browser.close();}
