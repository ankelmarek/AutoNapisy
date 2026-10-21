import {describe,it,expect} from 'vitest';
import {classicPresets,classicPresetStyle,animatedPresets,presetStyle,setCaptionAnimation,applyCaptionStyle,visualCaptionPreset} from '../src/captionPresets';
import {newProject,parseProject,serializeProject} from '../src/model';
import {yellowPreset} from '../src/captions';
import {captionMotion,hasCaptionMotion} from '../src/captionAnimation';
import {compositionSegments} from '../src/editing';
import {historyReducer} from '../src/useHistory';

describe('0.34a unified caption styles and persistent motion switch',()=>{
 it('keeps exactly two classic factories without changing the historical yellow preset',()=>{
  expect(classicPresets.map(p=>p.id)).toEqual(['classic-yellow','classic-outline']);
  expect(classicPresetStyle('classic-yellow')).toEqual({...yellowPreset,effect:'box',outlineWidth:0});
  const white=classicPresetStyle('classic-outline');expect(white).toMatchObject({color:'#ffffff',effect:'outline',outlineWidth:3});expect(white.animation).toBeUndefined();
 });
 it.each(animatedPresets)('$name Off survives save/reopen and On restores all original parameters',p=>{
  const base=presetStyle(newProject().styles.default,p.id),custom={...base,fontFamily:'Georgia',animation:{...base.animation!,speed:1.7,intensity:.4}},off=setCaptionAnimation(custom,false),project={...newProject(),styles:{default:off}};
  const loaded=parseProject(serializeProject(project));expect(loaded.schemaVersion).toBe(18);expect(loaded.styles.default).toEqual(off);expect(visualCaptionPreset(off)).toBe(p.id);expect(hasCaptionMotion(off)).toBe(false);
  expect(setCaptionAnimation(loaded.styles.default,true)).toEqual({...custom,animation:{...custom.animation,enabled:true}});
  const card={id:'a',text:'Zażółć gęślą',start:0,end:3,styleId:'default',words:[{text:'Zażółć',start:0,end:1},{text:'gęślą',start:1,end:3}]};
  for(const t of [.1,.8,1.5,2.9])expect(captionMotion(card,off,t)).toMatchObject({active:-1,scale:1,opacity:1,fallback:false});
 });
 it('imports every v15 style unchanged, including intensity zero and legacy highlight',()=>{
  const old={...newProject(),schemaVersion:15,styles:{default:{...newProject().styles.default,effect:'highlight' as const,background:'#742cff'},animated:{...presetStyle(newProject().styles.default,'neon'),animation:{...presetStyle(newProject().styles.default,'neon').animation!,intensity:0}}}};
  const next=parseProject(JSON.stringify(old));expect(next.styles).toEqual(old.styles);expect(hasCaptionMotion(next.styles.animated)).toBe(true);expect(visualCaptionPreset(next.styles.default)).toBeNull();
 });
 it('rejects enabled injection in v15 and null/nonboolean state in v16',()=>{
  const s=presetStyle(newProject().styles.default,'type-flow');for(const v of [14,15])expect(()=>parseProject(JSON.stringify({...newProject(),schemaVersion:v,styles:{default:setCaptionAnimation(s,false)}}))).toThrow();
  for(const enabled of [null,'false',0,{}])expect(()=>parseProject(JSON.stringify({...newProject(),styles:{default:{...s,animation:{...s.animation,enabled}}}}))).toThrow();
 });
 it('changes the font and motion of one style as one Undo without changing other captions or media',()=>{
  const base=newProject(),p={...base,media:{path:'Łódź.mp4',name:'Film',duration:4},timelineSegments:[{id:'a',text:'Żółta plansza',start:0,end:1,words:[],styleId:'default'},{id:'b',text:'Drugi napis',start:2,end:3,words:[],styleId:'default'}]},before=compositionSegments(p),s=setCaptionAnimation({...presetStyle(base.styles.default,'editorial'),fontFamily:'Segoe UI'},false),next=applyCaptionStyle(p,s,[before[0].id],'34');
  expect(compositionSegments(next)[1]).toEqual(before[1]);expect(next.styles.default).toEqual(p.styles.default);expect(next.media).toEqual(p.media);expect(next.timelineSegments).toEqual(p.timelineSegments);
  const h=historyReducer({present:p,past:[],future:[]},{type:'edit',value:next});expect(h.past).toHaveLength(1);expect(historyReducer(h,{type:'undo'}).present).toBe(p);expect(historyReducer(historyReducer(h,{type:'undo'}),{type:'redo'}).present).toBe(next);
 });
});
