import {describe,it,expect} from 'vitest';
import {selectCaptions,pruneCaptionSelection,mixedCaptionStyles} from '../src/captionSelection';
import {newProject,parseProject,serializeProject} from '../src/model';
import {compositionSegments} from '../src/editing';
import {hideCaptions} from '../src/captionEditing';
import {applyCaptionStyle,presetStyle,setCaptionAnimation} from '../src/captionPresets';
import {historyReducer} from '../src/useHistory';
const fixture=(n=10)=>({...newProject(),media:{path:'C:\\Łódź\\Film.mp4',name:'Film.mp4',duration:n},clips:[{id:'film',start:0,sourceIn:0,sourceOut:n,volume:.7}],timelineSegments:Array.from({length:n},(_,i)=>({id:`s${i}`,text:`Zażółć ${i}`,start:i,end:i+.8,words:[{text:'Zażółć',start:i,end:i+.3},{text:String(i),start:i+.3,end:i+.8}],styleId:'default'}))});
describe('0.34b shared caption selection and bulk style transaction',()=>{
 const order=Array.from({length:10},(_,i)=>`s${i}`);
 it('selects five nonadjacent captions in montage order and toggles one without editing',()=>{
  let state={ids:[] as string[],anchor:''};for(const id of ['s8','s0','s6','s2','s4'])state=selectCaptions(state.ids,state.anchor,id,order,{ctrlKey:true});
  expect(state.ids).toEqual(['s0','s2','s4','s6','s8']);expect(selectCaptions(state.ids,state.anchor,'s4',order,{ctrlKey:true}).ids).toEqual(['s0','s2','s6','s8']);expect(selectCaptions(state.ids,state.anchor,'s9',order).ids).toEqual(['s9']);
 });
 it('Shift ranges preserve the anchor in both directions; Ctrl+Shift unions the range',()=>{
  expect(selectCaptions(['s7'],'s7','s3',order,{shiftKey:true})).toEqual({ids:['s3','s4','s5','s6','s7'],anchor:'s7'});
  expect(selectCaptions(['s0','s7'],'s7','s8',order,{shiftKey:true,ctrlKey:true}).ids).toEqual(['s0','s7','s8']);
  expect(selectCaptions(['s7'],'deleted','s3',order,{shiftKey:true})).toEqual({ids:['s3'],anchor:'s3'});
 });
 it('prunes obsolete, hidden and duplicate IDs after a timeline change',()=>{
  expect(pruneCaptionSelection(['s1','s1','gone','s4'],['s4','s2','s1'])).toEqual(['s4','s1']);expect(selectCaptions(['gone'],'gone','absent',order)).toEqual({ids:[],anchor:''});
 });
 it('reports mixed effective configurations, including fonts and animation Off, independently of key order',()=>{
  const a=presetStyle(newProject().styles.default,'karaoke-flow'),same=Object.fromEntries(Object.entries(a).reverse()) as typeof a;
  expect(mixedCaptionStyles([a,same])).toBe(false);expect(mixedCaptionStyles([a,{...a,fontFamily:'Arial'}])).toBe(true);expect(mixedCaptionStyles([a,setCaptionAnimation(a,false)])).toBe(true);expect(mixedCaptionStyles([])).toBe(false);
 });
 it('applies Karaoke then font/Off to exactly five captions as one Undo each, preserving all source data',()=>{
  const p=fixture(),before=compositionSegments(p),ids=before.filter((_,i)=>i%2===0).map(s=>s.id),karaoke=applyCaptionStyle(p,presetStyle(p.styles.default,'karaoke-flow'),ids,'karaoke'),style=karaoke.styles[karaoke.captionEdits[ids[0]].styleId!],next=applyCaptionStyle(karaoke,setCaptionAnimation({...style,fontFamily:'Segoe UI'},false),ids,'off');
  for(const s of compositionSegments(next)){if(ids.includes(s.id)){expect(next.styles[s.styleId]).toMatchObject({fontFamily:'Segoe UI',animation:{preset:'karaoke-flow',enabled:false}});expect({...s,styleId:'default'}).toEqual(before.find(b=>b.id===s.id));}else expect(s).toEqual(before.find(b=>b.id===s.id));}
  expect(next.timelineSegments).toBe(p.timelineSegments);expect(next.clips).toBe(p.clips);expect(next.media).toBe(p.media);expect(next.masterAudio).toBe(p.masterAudio);expect(next.styles.default).toBe(p.styles.default);
  const h=historyReducer({present:karaoke,past:[],future:[]},{type:'edit',value:next}),u=historyReducer(h,{type:'undo'});expect(h.past).toHaveLength(1);expect(u.present).toBe(karaoke);expect(historyReducer(u,{type:'redo'}).present).toBe(next);expect({...parseProject(serializeProject(next)),updatedAt:next.updatedAt}).toEqual(next);
 });
 it('keeps offsets and trim edits when applying a group style',()=>{
  const p=fixture(),id=compositionSegments(p)[2].id,edited={...p,captionEdits:{[id]:{trimStart:.1,trimEnd:.1,offset:.05}}},next=applyCaptionStyle(edited,presetStyle(p.styles.default,'pop-beat'),[id],'trim');expect(next.captionEdits[id]).toMatchObject(edited.captionEdits[id]);expect(compositionSegments(next)[2].words).toEqual(compositionSegments(edited)[2].words);
 });
 it('hides a group in one transaction and prunes selection without modifying raw text/timing',()=>{
  const p=fixture(),ids=compositionSegments(p).filter((_,i)=>i%2===0).map(s=>s.id),next=hideCaptions(p,ids);expect(compositionSegments(next)).toHaveLength(5);expect(pruneCaptionSelection(ids,compositionSegments(next).map(s=>s.id))).toEqual([]);expect(next.timelineSegments).toBe(p.timelineSegments);expect(next.clips).toBe(p.clips);
 });
 it('rejects locked-T bulk changes and never interprets an empty selection as all',()=>{
  const p=fixture(),locked={...p,tracks:{T:{locked:true}}},style=presetStyle(p.styles.default,'karaoke-flow');expect(()=>applyCaptionStyle(locked,style,['timeline:s0'])).toThrow(/zablokowana/);expect(()=>hideCaptions(locked,['timeline:s0'])).toThrow(/zablokowana/);expect(()=>applyCaptionStyle(p,style,[])).toThrow(/Wybierz/);expect(p.styles.default.animation).toBeUndefined();
 });
 it('handles 10000 captions with linear selection and exact bulk targeting',()=>{
  const p=fixture(10000),order=compositionSegments(p).map(s=>s.id),selected=order.filter((_,i)=>i%2===0),started=performance.now();expect(pruneCaptionSelection(selected,order)).toHaveLength(5000);const next=applyCaptionStyle(p,presetStyle(p.styles.default,'karaoke-flow'),selected,'long');expect(Object.keys(next.captionEdits)).toHaveLength(5000);expect(performance.now()-started).toBeLessThan(3000);
 });
});
