import type {CaptionCard,CaptionStyle} from './captions';

export const CAPTION_FPS=30;
export const captionFrameTime=(time:number)=>Math.floor(Math.max(0,Number.isFinite(time)?time:0)*CAPTION_FPS+1e-7)/CAPTION_FPS;
const normalized=(text:string)=>text.normalize('NFC').trim().replace(/\s+/g,' ');
/** Timing is usable only when every displayed token still corresponds to its source word. */
export function synchronizedWords(card:CaptionCard,style:CaptionStyle){
 const words=card.words??[],fold=(s:string)=>style.uppercase?normalized(s).toLocaleUpperCase('pl'):normalized(s);
 return words.length>0&&fold(words.map(w=>w.text.trim()).join(' '))===fold(card.text)&&words.every((w,i)=>
  w.text.trim().length>0&&!/\s/.test(w.text.trim())&&Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.start>=card.start-1e-6&&w.end<=card.end+1e-6&&w.end>w.start&&(i===0||w.start>=words[i-1].end-1e-6));
}
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
export function captionMotion(card:CaptionCard,style:CaptionStyle,time:number){
 const t=captionFrameTime(time),a=style.animation;
 if(!a)return {time:t,active:-1,scale:1,opacity:1,fallback:false};
 const reliable=synchronizedWords(card,style),active=reliable?(card.words??[]).findIndex(w=>t>=w.start&&t<w.end):-1;
 let scale=1;
 if(active>=0&&a.preset==='pop-beat'){
  const u=(t-card.words![active].start)/(.18/a.speed);
  // A single bounded overshoot, never a repeating flash. Intensity zero is neutral.
  scale=1+a.intensity*(u<.55?-.15+.25*smooth(u/.55):u<1?.1*(1-smooth((u-.55)/.45)):0);
 }
 return {time:t,active,scale,opacity:reliable?1:smooth((t-card.start)/(.18/a.speed)),fallback:!reliable};
}
