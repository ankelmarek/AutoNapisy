import {describe,it,expect} from 'vitest';
import {newProject,parseProject,serializeProject,type Project} from '../src/model';
import {inheritCaptionWords,captionTimingState} from '../src/captionTiming';
import {compositionSegments,compositionProject} from '../src/editing';
import {editCaption,setCaptionTiming,moveCaption} from '../src/captionEditing';
import {captionExport} from '../src/captions';
import {captionMotion,synchronizedWords} from '../src/captionAnimation';
import {presetStyle,animatedPresets} from '../src/captionPresets';
import {historyReducer} from '../src/useHistory';
import {captionRipple} from '../src/ripple';
import {planSmartCut} from '../src/smartCut';
const phrase='Dzisiaj otwieramy nową drogę';
const segment=(text=phrase)=>({id:'pl',text,start:0,end:4,styleId:'default',words:text.split(' ').map((text,i)=>({text,start:i+.1,end:i+.8}))});
function sample():Project{const p=newProject();return {...p,media:{path:'Łódź.mp4',name:'Łódź',duration:12},clips:[{id:'video',sourceIn:0,sourceOut:6,start:0}],timelineSegments:[segment()],styles:{default:presetStyle(p.styles.default,'karaoke-flow')}};}
describe('0.35a positional correction, not forced alignment',()=>{
 it.each(['Dzisiaj rozpoczynamy nową drogę','Dzisiaj otwieramy nowa drogę','Dzisiaj, otwieramy nową drogę!','DZISIAJ OTWIERAMY NOWĄ DROGĘ','  Dzisiaj\n otwieramy  nową drogę  ','Dzisiaj otwieramy nową drogę'.normalize('NFD')])('retains only actual intervals for an unambiguous correction: %s',text=>{
  const s=segment(),words=inheritCaptionWords(s,text)!;expect(words).not.toBeNull();expect(words.map(w=>[w.start,w.end])).toEqual(s.words.map(w=>[w.start,w.end]));expect(words.map(w=>w.text).join(' ')).toBe(text.trim().replace(/\s+/gu,' '));
 });
 it.each(['Dzisiaj rozpoczynamy budowę trzech nowych dróg','Dzisiaj otwieramy drogę','otwieramy Dzisiaj nową drogę','nową drogę Dzisiaj otwieramy','Tutaj budujemy szeroką ulicę','','   ','Dzisiaj , otwieramy nową drogę'])('rejects uncertain counts, moves and whole rewritten phrases: %s',text=>{expect(inheritCaptionWords(segment(),text)).toBeNull();});
 it('handles one-word replacement, repeated anchors, hyphens, numbers and punctuation without guessing token splits',()=>{
  expect(inheritCaptionWords(segment('Tak'), 'Nie')?.[0]).toMatchObject({text:'Nie',start:.1,end:.8});expect(inheritCaptionWords(segment('To jest to'), 'Tu jest to')).not.toBeNull();
  expect(inheritCaptionWords(segment('Mamy biało-czerwony znak'), 'Mamy biało‑czerwony znak!')).not.toBeNull();
  expect(inheritCaptionWords(segment('Kwota 1 234 567'), 'Kwota 1234567')).toBeNull();expect(inheritCaptionWords(segment('Kwota 1234 złotych'), 'Kwota 1235 złotych')).not.toBeNull();
  const p=sample();expect(captionTimingState(p,{...segment('Tu — teraz'),id:'timeline:pl'})).toBe('source');
 });
 it('does not repair absent, stale, overlapping, zero, nonfinite or out-of-range source times',()=>{
  const s=segment();for(const words of [[],s.words.slice(1),s.words.map(w=>({...w,text:'inny'})),s.words.map(w=>({...w,start:0})),s.words.map((w,i)=>({...w,start:i?s.words[i-1].end-1e-7:w.start})),s.words.map(w=>({...w,end:w.start})),s.words.map(w=>({...w,end:Infinity})),s.words.map(w=>({...w,end:9}))])expect(inheritCaptionWords({...s,words},phrase)).toBeNull();
 });
 it('stores provenance, changes one caption only, retains all raw words/style/mix, and produces synchronized export cards',()=>{
  const p=sample();p.timelineSegments!.push({...segment(),id:'other',start:4,end:6,words:[]});const before=JSON.stringify(p),s=compositionSegments(p)[0],q=editCaption(p,s,{text:'Dzisiaj rozpoczynamy nową drogę'}),corrected=compositionSegments(q)[0];
  expect(q.captionEdits[s.id].textTiming).toEqual({mode:'inherited',sourceText:phrase});expect(captionTimingState(q,corrected)).toBe('inherited');expect(corrected.words.map(w=>[w.start,w.end])).toEqual(s.words.map(w=>[w.start,w.end]));expect(captionMotion(corrected,q.styles.default,1.2)).toMatchObject({active:1,fallback:false});
  expect(compositionSegments(q)[1]).toEqual(compositionSegments(p)[1]);expect(q.styles).toBe(p.styles);expect(q.clips).toBe(p.clips);expect(q.masterAudio).toBe(p.masterAudio);expect(JSON.stringify(p)).toBe(before);
  const out=captionExport(compositionProject(q));expect(out.segments[0].text).toContain('ROZPOCZYNAMY');expect(synchronizedWords(out.segments[0],q.styles.default)).toBe(true);expect(parseProject(serializeProject(q)).captionEdits).toEqual(q.captionEdits);
 });
 it('keeps legacy edited captions on the original safe fallback until explicitly changed',()=>{
  const p=sample();p.captionEdits['timeline:pl']={trimStart:0,trimEnd:0,text:'Dzisiaj rozpoczynamy nową drogę'};const v16={...p,schemaVersion:16};const q=parseProject(JSON.stringify(v16));expect(q.schemaVersion).toBe(17);expect(q.captionEdits).toEqual(p.captionEdits);expect(compositionSegments(q)[0].words).toEqual([]);expect(captionTimingState(q,compositionSegments(q)[0])).toBe('uncertain');
  const accepted=setCaptionTiming(q,compositionSegments(q)[0],'inherited');expect(captionTimingState(accepted,compositionSegments(accepted)[0])).toBe('inherited');
 });
 it('keeps an explicit whole-card choice through later edits, reopen and a deliberate return to inherited times',()=>{
  const p=sample(),s=compositionSegments(p)[0],edited=editCaption(p,s,{text:'Dzisiaj rozpoczynamy nową drogę'}),q=setCaptionTiming(edited,compositionSegments(edited)[0],'board'),restored=parseProject(serializeProject(q));expect(captionTimingState(restored,compositionSegments(restored)[0])).toBe('board');expect(compositionSegments(restored)[0].words).toEqual([]);
  const r=editCaption(restored,compositionSegments(restored)[0],{text:'Dzisiaj otwieramy nową drogę!'});expect(r.captionEdits[s.id].textTiming).toEqual({mode:'board'});expect(compositionSegments(setCaptionTiming(r,compositionSegments(r)[0],'inherited'))[0].words).toHaveLength(4);
 });
 it('clears inherited mapping on an uncertain revision and never falls back to old words in export',()=>{
  let p=sample();p=editCaption(p,compositionSegments(p)[0],{text:'Dzisiaj rozpoczynamy nową drogę'});p=editCaption(p,compositionSegments(p)[0],{text:'Słowa których nie wypowiedziano wcale'});expect(p.captionEdits['timeline:pl'].textTiming).toBeUndefined();expect(compositionSegments(p)[0].words).toEqual([]);expect(captionExport(compositionProject(p)).segments[0].text).toContain('WCALE');expect(()=>setCaptionTiming(p,compositionSegments(p)[0],'inherited')).toThrow();
 });
 it('rejects stale source identity and does not infer new mappings after source clipping',()=>{
  const p=sample(),q=editCaption(p,compositionSegments(p)[0],{text:'Dzisiaj rozpoczynamy nową drogę'});q.timelineSegments![0]={...segment(),text:'Tutaj budujemy szeroką ulicę'};expect(compositionSegments(q)[0].words).toEqual([]);
 });
 it('maps source clocks for repeated source instances and movement once, without touching another occurrence',()=>{
  const p=sample();p.timelineSegments=null;p.segments=[segment()];p.clips!.push({id:'again',sourceIn:0,sourceOut:6,start:6});let q=editCaption(p,compositionSegments(p)[0],{text:'Dzisiaj rozpoczynamy nową drogę'});expect(compositionSegments(q)[1].text).toBe(phrase);
  q={...q,clips:q.clips!.map(c=>({...c,start:c.start+2}))};expect(compositionSegments(q)[0].words[1]).toMatchObject({text:'rozpoczynamy',start:3.1,end:3.8});q=moveCaption(q,compositionSegments(q)[0],.5);expect(compositionSegments(q)[0].words[1].start).toBeCloseTo(3.6);expect(compositionSegments(q)[1].words[1].start).toBeCloseTo(9.1);
  q={...q,clips:q.clips!.map((c,i)=>i?c:{...c,sourceIn:2,start:c.start+2})};expect(compositionSegments(q)[0].words).toEqual([]);
 });
 it('rejects metadata injection in v1–v16 and invalid/null/unknown fields in v17, without modifying migrations',()=>{
  const p=sample(),edit={trimStart:0,trimEnd:0,text:phrase,textTiming:{mode:'inherited',sourceText:phrase}};
  for(const schemaVersion of Array.from({length:16},(_,i)=>i+1))expect(()=>parseProject(JSON.stringify({...p,schemaVersion,captionEdits:{x:edit}}))).toThrow();
  for(const textTiming of [null,{},'inherited',{mode:'asr'},{mode:'board',sourceText:phrase},{mode:'inherited',sourceText:''},{mode:'inherited',sourceText:phrase,words:[]}])expect(()=>parseProject(JSON.stringify({...p,captionEdits:{x:{...edit,textTiming}}}))).toThrow();
  expect(()=>parseProject(JSON.stringify({...p,captionEdits:{x:{trimStart:0,trimEnd:0,textTiming:{mode:'board'}}}}))).toThrow();
 });
 it('protects track lock for correction and explicit timing mode',()=>{const p=sample();p.tracks.T={locked:true};const s=compositionSegments(p)[0];expect(()=>editCaption(p,s,{text:'Poprawione'})).toThrow();expect(()=>setCaptionTiming(p,s,'board')).toThrow();});
 it('materializes a translated caption through Ripple without losing correction provenance or shifting words twice',()=>{
  let p=sample();p=editCaption(p,compositionSegments(p)[0],{text:'Dzisiaj rozpoczynamy nową drogę'});p=moveCaption(p,compositionSegments(p)[0],2);p={...p,clips:p.clips!.map(c=>({...c,sourceOut:5}))};const q=captionRipple(p,.5,1.5,-1),s=compositionSegments(q)[0];expect(s.text).toBe('Dzisiaj rozpoczynamy nową drogę');expect(s.words[1].start).toBeCloseTo(2.1);expect(captionTimingState(q,s)).toBe('inherited');expect(q.timelineSegments![0].text).toBe(phrase);expect(parseProject(serializeProject(q)).captionEdits[s.id].textTiming?.mode).toBe('inherited');
  const board=setCaptionTiming(p,compositionSegments(p)[0],'board'),b=captionRipple(board,.5,1.5,-1);expect(captionTimingState(b,compositionSegments(b)[0])).toBe('board');
 });
 it('retains the explicit timing decision when SmartCut remaps an unchanged source phrase',()=>{
  let p=sample();p.timelineSegments=null;p.rippleEnabled=true;p.clips![0].sourceOut=8;p.segments=[{...segment(),start:2,end:6,words:segment().words.map(w=>({...w,start:w.start+2,end:w.end+2}))}];p=editCaption(p,compositionSegments(p)[0],{text:'Dzisiaj rozpoczynamy nową drogę'});const plan=planSmartCut(p,{kind:'range',id:'video',from:0,to:1},{ripple:true,captions:true,token:'correction'});expect(plan.conflicts).toEqual([]);const s=compositionSegments(plan.next)[0];expect(s.text).toBe('Dzisiaj rozpoczynamy nową drogę');expect(s.words[1].start).toBeCloseTo(2.1);expect(captionTimingState(plan.next,s)).toBe('inherited');
 });
 it.each(animatedPresets)('retains $name and its Off/On word clock after an inherited correction',preset=>{
  const p=sample();p.styles.default=presetStyle(p.styles.default,preset.id);const q=editCaption(p,compositionSegments(p)[0],{text:'Dzisiaj rozpoczynamy nową drogę'}),s=compositionSegments(q)[0],exported=captionExport(compositionProject(q)).segments[0];expect(synchronizedWords(exported,q.styles.default)).toBe(true);expect(captionMotion(s,q.styles.default,1.2)).toMatchObject({active:1,fallback:false});expect(captionMotion(s,{...q.styles.default,animation:{...q.styles.default.animation!,enabled:false}},1.2)).toMatchObject({active:-1,fallback:false});expect(q.styles).toBe(p.styles);
 });
 it('creates one correction transaction and a separate explicit whole-card transaction, with exact Undo/Redo',()=>{
  const p=sample(),corrected=editCaption(p,compositionSegments(p)[0],{text:'Dzisiaj rozpoczynamy nową drogę'}),h=historyReducer({present:p,past:[],future:[]},{type:'edit',value:corrected});expect(h.past).toHaveLength(1);expect(historyReducer(h,{type:'undo'}).present).toBe(p);const board=setCaptionTiming(corrected,compositionSegments(corrected)[0],'board'),both=historyReducer(h,{type:'edit',value:board});expect(both.past).toHaveLength(2);expect(historyReducer(both,{type:'undo'}).present).toBe(corrected);expect(historyReducer(historyReducer(both,{type:'undo'}),{type:'redo'}).present).toBe(board);
 });
});
