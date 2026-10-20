import type {Project} from './model';
type TimedText=Pick<Project['segments'][number],'text'|'start'|'end'|'words'>;
const normalized=(s:string)=>s.normalize('NFC').trim().replace(/\s+/gu,' ');
const tokens=(s:string)=>normalized(s).split(' ').filter(Boolean);
const key=(s:string)=>s.normalize('NFC').toLocaleLowerCase('pl').replace(/[’‘]/gu,"'").replace(/[‐‑]/gu,'-').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'');
/** Existing intervals only. This is a positional correction, never audio alignment. */
export function inheritCaptionWords(source:TimedText,text:string):TimedText['words']|null{
 const words=source.words,from=tokens(source.text),to=text.trim().split(/\s+/u).filter(Boolean);
 if(!words.length||words.length>10000||from.length!==words.length||to.length!==words.length||normalized(words.map(w=>w.text.trim()).join(' '))!==normalized(source.text))return null;
 if(words.some((w,i)=>tokens(w.text).length!==1||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<source.start-1e-6||w.end>source.end+1e-6||w.end<=w.start||(i>0&&w.start<words[i-1].end)))return null;
 const a=from.map(key),b=to.map(key);if(a.some(s=>!s)||b.some(s=>!s))return null;
 const changed=a.flatMap((s,i)=>s!==b[i]?[i]:[]);
 // Reused words in changed positions indicate a move, or an ambiguous deletion/insertion.
 const oldChanged=new Set(changed.map(i=>a[i]));if(changed.some(i=>oldChanged.has(b[i])))return null;
 // A whole rewritten phrase has no unchanged anchor. A single word has one interval.
 if(changed.length===words.length&&words.length>1)return null;
 return words.map((w,i)=>({...w,text:to[i]}));
}
export type CaptionTimingState='source'|'inherited'|'uncertain'|'board';
export function captionTimingState(p:Project,s:TimedText&{id:string}):CaptionTimingState{
 const e=p.captionEdits[s.id];if(e?.textTiming?.mode==='board')return 'board';
 if(!inheritCaptionWords(s,s.text))return 'uncertain';
 return e?.textTiming?.mode==='inherited'?'inherited':'source';
}
export const captionTimingLabel=(state:CaptionTimingState)=>({source:'Czasy z projektu',inherited:'Korekta zachowała czasy',uncertain:'Wymaga dopasowania',board:'Animacja całej planszy'})[state];
