import type {Project} from './model';
import {synchronizedWords} from './captionAnimation';
type TimedText=Pick<Project['segments'][number],'text'|'start'|'end'|'words'>;
const normalized=(s:string)=>s.normalize('NFC').trim().replace(/\s+/gu,' ');
const tokens=(s:string)=>normalized(s).split(' ').filter(Boolean);
const key=(s:string)=>s.normalize('NFC').toLocaleLowerCase('pl').replace(/[’‘]/gu,"'").replace(/[‐‑]/gu,'-').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'');
export const captionTokens=(s:string)=>s.trim().split(/\s+/u).filter(Boolean);
export const captionTokenKey=key;
export type WordDraft={text:string;start?:number;end?:number;origin?:'inherited'|'manual'|'reanalyzed'};
/** Only a pair present at the same rank in EVERY longest common subsequence is
 * retained. Repeated/reordered ambiguities stay empty. This is textual inheritance,
 * never evidence that a word was spoken. Bounded O(n*m) memory/work. */
export function captionAnchors(source:TimedText,text:string):WordDraft[]{
 const to=captionTokens(text),a=captionTokens(source.text).map(key),b=to.map(key);
 const empty=to.map(text=>({text}));if(a.length>256||b.length>256||!inheritCaptionWords(source,source.text))return empty;
 const n=a.length,m=b.length,pre=Array.from({length:n+1},()=>new Uint16Array(m+1)),post=Array.from({length:n+1},()=>new Uint16Array(m+1));
 for(let i=0;i<n;i++)for(let j=0;j<m;j++)pre[i+1][j+1]=a[i]&&a[i]===b[j]?pre[i][j]+1:Math.max(pre[i][j+1],pre[i+1][j]);
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)post[i][j]=a[i]&&a[i]===b[j]?post[i+1][j+1]+1:Math.max(post[i+1][j],post[i][j+1]);
 const candidates:Array<Array<[number,number]>>=Array.from({length:pre[n][m]},()=>[]);
 for(let i=0;i<n;i++)for(let j=0;j<m;j++)if(a[i]&&a[i]===b[j]&&pre[i][j]+1+post[i+1][j+1]===pre[n][m])candidates[pre[i][j]].push([i,j]);
 const out:WordDraft[]=empty;for(const pairs of candidates)if(pairs.length===1){const [i,j]=pairs[0],w=source.words[i];out[j]={text:to[j],start:w.start-source.start,end:w.end-source.start,origin:'inherited'};}return out;
}
export function checkedWordDraft(rows:readonly WordDraft[],text:string,duration:number):TimedText['words']{
 const parts=captionTokens(text);if(!rows.length||rows.length>256||rows.length!==parts.length||!Number.isFinite(duration)||duration<=0)throw Error('Edycja czasów obsługuje od 1 do 256 słów.');
 // Subtracting two absolute clocks can lose a few ULPs (4.3 - 1.1 < 3.2).
 // Canonicalize only that arithmetic residue, never millisecond input errors or overlaps.
 const epsilon=8*Number.EPSILON*Math.max(1,duration);
 return rows.map((w,i)=>{const end=w.end!==undefined&&w.end>duration&&w.end-duration<=epsilon?duration:w.end;if(w.text!==parts[i]||w.start===undefined||end===undefined||!Number.isFinite(w.start)||!Number.isFinite(end)||w.start<0||end<=w.start||end>duration||(i>0&&w.start<Math.min(rows[i-1].end!,duration)))throw Error(`Uzupełnij poprawny, niepokrywający się zakres słowa ${i+1}. Czasy są liczone od początku napisu.`);return {text:w.text,start:w.start,end};});
}
/** Explicit playhead placement: millisecond display precision within the actual span. */
export const captionPlayheadTime=(time:number,start:number,end:number)=>Math.max(0,Math.min(end-start,Number((time-start).toFixed(3))));
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
export type CaptionTimingState='source'|'inherited'|'uncertain'|'board'|'manual'|'reanalyzed'|'retained';
export function captionTimingState(p:Project,s:TimedText&{id:string;styleId:string}):CaptionTimingState{
 const e=p.captionEdits[s.id];if(e?.textTiming?.mode==='board'||(e?.textTiming&&'disabled' in e.textTiming&&e.textTiming.disabled))return 'board';
 if(!synchronizedWords(s,p.styles[s.styleId]))return 'uncertain';
 return e?.textTiming?.mode??'source';
}
export const captionTimingLabel=(state:CaptionTimingState)=>({source:'Czasy z projektu',inherited:'Korekta zachowała czasy',uncertain:'Wymaga dopasowania',board:'Animacja całej planszy',manual:'Ręczne czasy',retained:'Korekta zachowała czasy',reanalyzed:'Czasy z ponownej analizy Whisper'})[state];
