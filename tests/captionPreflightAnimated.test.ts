import {describe,it,expect,vi,afterEach} from 'vitest';
import {newProject} from '../src/model';
import {presetStyle} from '../src/captionPresets';
import {captionBounds,animatedCaptionBounds,captionPreflight} from '../src/captionPreflight';
const card={id:'a',text:'Zażółć gęślą jaźń',start:0,end:3,styleId:'default',words:[{text:'Zażółć',start:.1,end:.8},{text:'gęślą',start:1,end:1.6},{text:'jaźń',start:2,end:2.7}]};
const mockMetrics=()=>vi.stubGlobal('document',{createElement:()=>({getContext:()=>({font:'',measureText:(s:string)=>({width:s.length*20,fontBoundingBoxAscent:40,fontBoundingBoxDescent:10,actualBoundingBoxAscent:40,actualBoundingBoxDescent:10})})})});
afterEach(()=>vi.unstubAllGlobals());
describe('0.33c conservative caption motion envelopes',()=>{
 it('motion Off measures the full static card, including Impact and Type Flow words',()=>{mockMetrics();for(const id of ['impact','type-flow','neon'] as const){const s=presetStyle(newProject().styles.default,id),off={...s,animation:{...s.animation!,enabled:false}};expect(animatedCaptionBounds(card,off,720,1280)).toEqual(captionBounds(card.text,off,720,1280));}});
 it.each(['pop-beat','neon','slide-reveal','editorial'] as const)('%s includes extrema rather than only settled frame',preset=>{mockMetrics();const style=presetStyle(newProject().styles.default,preset),animated=animatedCaptionBounds(card,style,720,1280),base=captionBounds(card.text,style,720,1280);expect(animated.bottom).toBeGreaterThan(base.bottom);expect(animated.left).toBeLessThanOrEqual(base.left);expect(animated.right).toBeGreaterThanOrEqual(base.right);});
 it('uses logical 720px geometry at 9:16, 16:9 and square outputs',()=>{mockMetrics();const s=presetStyle(newProject().styles.default,'neon');for(const [w,h] of [[1080,1920],[1920,1080],[1080,1080]]){const b=animatedCaptionBounds(card,s,w,h),logical=animatedCaptionBounds(card,s,720,h*720/w);expect(b.left).toBeCloseTo(logical.left*w/720);expect(b.bottom).toBeCloseTo(logical.bottom*w/720);}});
 it('manual mismatch removes per-word motion envelope, preserving honest whole-card fallback',()=>{mockMetrics();const s=presetStyle(newProject().styles.default,'pop-beat'),manual={...card,text:'Ręczna zmiana'};expect(animatedCaptionBounds(manual,s,720,1280)).toEqual(captionBounds(manual.text,s,720,1280));});
 it('warns at an unsafe edge even when the settled static text fits',()=>{mockMetrics();const s={...presetStyle(newProject().styles.default,'neon'),marginPercent:0},p={...newProject(),media:{path:'Łódź.mp4',name:'Film',duration:3},clips:[{id:'v',start:0,sourceIn:0,sourceOut:3}],segments:[card],styles:{default:s}};expect(captionPreflight(p,720,1280,null).some(i=>i.message.includes('poza kadr'))).toBe(true);});
 it('legacy static styles retain the exact old measurement',()=>{mockMetrics();const style=newProject().styles.default;expect(animatedCaptionBounds(card,style,1920,1080)).toEqual(captionBounds(card.text,style,1920,1080));});
});
