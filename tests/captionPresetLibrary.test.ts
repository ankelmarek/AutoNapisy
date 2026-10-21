import {describe,it,expect,vi,afterEach} from 'vitest';
import {presetCatalogSchema,presetNameSchema} from '../src/captionPresetLibrary';
import {newProject,parseProject,serializeProject} from '../src/model';
import {presetStyle,applyCaptionStyle,setCaptionAnimation,animatedPresets} from '../src/captionPresets';
import {compositionSegments} from '../src/editing';
import {captionFontFamily,measureFontAvailability,inspectCaptionFont,knownCaptionFont,fontFallbackMessage} from '../src/captionFonts';
import {captionExport} from '../src/captions';
afterEach(()=>vi.unstubAllGlobals());
const id='user-'+'a'.repeat(32),base=newProject().styles.default;
describe('0.34c own preset snapshots and validation',()=>{
 it('validates Unicode names, length, controls, IDs, names and future catalog versions',()=>{
  expect(presetNameSchema.parse('  Moja żółta 🎬  ')).toBe('Moja żółta 🎬');for(const n of ['', 'a'.repeat(61),'Nowy\nStyl','Nowy\u0000Styl'])expect(()=>presetNameSchema.parse(n)).toThrow();
  const e={id,name:'Żółta',style:base},c={version:1,revision:1,entries:[e]};expect(presetCatalogSchema.parse(c).entries[0]).toEqual(e);
  for(const bad of [{...c,version:2},{...c,revision:-1},{...c,entries:[e,e]},{...c,entries:[e,{...e,id:'user-'+'b'.repeat(32),name:'ŻÓŁTA'}]},{...c,entries:[{...e,id:'classic-yellow'}]},{...c,entries:[{...e,style:{...base,shell:'cmd.exe'}}]}])expect(()=>presetCatalogSchema.parse(bad)).toThrow();
 });
 it.each(animatedPresets)('$name owns a complete font/layout/animation snapshot independent of its library entry',preset=>{
  const p={...newProject(),media:{path:'Łódź.mp4',name:'Film',duration:2},timelineSegments:[{id:'a',text:'Zażółć gęślą',start:0,end:1,styleId:'default',words:[]}]},style=setCaptionAnimation({...presetStyle(base,preset.id),fontFamily:'Segoe UI'},false),library=presetCatalogSchema.parse({version:1,revision:1,entries:[{id,name:'Mój wariant',style}]}),next=applyCaptionStyle(p,library.entries[0].style,compositionSegments(p).map(s=>s.id),'own');
  library.entries[0].style.fontSize=99;library.entries.length=0;const restored=parseProject(serializeProject(next)),s=restored.styles[restored.captionEdits['timeline:a'].styleId!];expect(s).toEqual(style);expect(restored.schemaVersion).toBe(18);expect(restored.timelineSegments).toEqual(p.timelineSegments);expect(restored.styles.default).toEqual(base);
 });
 it('does not confuse FontFaceSet.check success with actual availability and escapes CSS names',()=>{
  const fake=(font:string)=>font.endsWith('monospace')?100:200;expect(measureFontAvailability('Absent',fake)).toBe(false);expect(measureFontAvailability('Loaded',fake,true)).toBe(true);expect(measureFontAvailability('Arial',f=>f.includes('Arial')?150:fake(f))).toBe(true);expect(captionFontFamily('Font "Łódź"')).toBe('"Font \\"Łódź\\"", "Bebas Neue", sans-serif');expect(fontFallbackMessage('Absent')).toContain('Bebas Neue');
 });
 it('wraps export and SRT snapshots with the same missing-font fallback as the preview, without changing source data',()=>{
  vi.stubGlobal('document',{createElement:()=>({getContext:()=>({font:'',measureText(text:string){return {width:text.length*(this.font.includes('"Bebas Neue"')?20:40)};}})})});
  const segment={id:'a',text:'Zażółć gęślą jaźń',start:0,end:2,styleId:'default',words:[]},p={...newProject(),segments:[segment]},missing={...p,styles:{default:{...p.styles.default,fontFamily:'RolVixa Missing Font 034c'}}},before=JSON.stringify(missing),expected=captionExport(p).segments;
  expect(expected[0].text).not.toContain('\n');expect(captionExport(missing).segments).toEqual(expected);expect(JSON.stringify(missing)).toBe(before);
 });
 it('loads the bundled fallback before probing; absent fonts yield a cached honest status without changing a project',async()=>{
  const loads:string[]=[];vi.stubGlobal('document',{fonts:{load:async(f:string)=>{loads.push(f);return [];},ready:Promise.resolve(),[Symbol.iterator]:function*(){}},createElement:()=>({getContext:()=>({font:'',measureText(){return {width:this.font.endsWith('monospace')?100:200};}})})});const p={...newProject(),styles:{default:{...base,fontFamily:'Definitely absent 034c'}}},before=JSON.stringify(p);const a=await inspectCaptionFont(p.styles.default.fontFamily);expect(a.available).toBe(false);expect(loads).toContain('24px "Bebas Neue"');expect(knownCaptionFont(a.family)).toEqual(a);await inspectCaptionFont(a.family);expect(loads).toHaveLength(2);expect(JSON.stringify(p)).toBe(before);
 });
});
