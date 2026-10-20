/** One explicitly bundled fallback for DOM, metrics, Canvas and every export. */
export const CAPTION_FALLBACK='Bebas Neue';
export const captionFontChoices=['Bebas Neue','Arial','Segoe UI','Georgia'] as const;
export function captionFontFamily(family:string):string{return `${JSON.stringify(family)}, "${CAPTION_FALLBACK}", sans-serif`;}
export type CaptionFontStatus={family:string;available:boolean;fallback:string};
const checks=new Map<string,Promise<CaptionFontStatus>>(),known=new Map<string,CaptionFontStatus>();
export async function loadCaptionFont(family:string){
 await Promise.all([CAPTION_FALLBACK,family].map(f=>document.fonts.load(`24px ${JSON.stringify(f)}`).catch(()=>[])));await document.fonts.ready;
}
/** FontFaceSet.check alone accepts absent system fonts. Probe two fallback metrics too. */
export function measureFontAvailability(family:string,measure:(font:string)=>number,loadedFace=false):boolean{
 if(loadedFace)return true;
 return ['monospace','serif'].some(base=>measure(`72px ${JSON.stringify(family)}, ${base}`)!==measure(`72px ${base}`));
}
export function inspectCaptionFont(family:string):Promise<CaptionFontStatus>{
 let pending=checks.get(family);if(!pending){pending=(async()=>{await loadCaptionFont(family);const c=document.createElement('canvas').getContext('2d');const loaded=[...document.fonts].some(f=>f.family.replace(/^["']|["']$/g,'').toLowerCase()===family.toLowerCase()&&f.status==='loaded');const available=!!c&&measureFontAvailability(family,font=>{c.font=font;return c.measureText('Zażółć gęślą jaźń WMWM 019 il.').width;},loaded);const status={family,available,fallback:CAPTION_FALLBACK};known.set(family,status);return status;})();checks.set(family,pending);}return pending;
}
export function knownCaptionFont(family:string){return known.get(family);}
export function fontFallbackMessage(family:string){if(family===CAPTION_FALLBACK)return 'Nie udało się wczytać dołączonego fontu Bebas Neue. Użyto awaryjnego sans-serif. Uruchom ponownie aplikację.';return `Brak fontu „${family}”. Podgląd i eksport używają ${CAPTION_FALLBACK}. Zainstaluj font i uruchom ponownie aplikację lub wybierz inny krój.`;}
