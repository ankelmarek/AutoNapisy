import {z} from 'zod';
import type {Project} from './model';
export const exportOptionsSchema=z.object({width:z.number().int().min(128).max(3840).multipleOf(2).nullable(),height:z.number().int().min(128).max(3840).multipleOf(2).nullable(),crf:z.number().int().min(12).max(35),speed:z.enum(['fast','medium','slow']),audioKbps:z.union([z.literal(96),z.literal(128),z.literal(192),z.literal(256),z.literal(320)]),fit:z.enum(['fit','crop']),captions:z.enum(['burn','srt','none']),targetMb:z.number().finite().min(.25).max(32000).nullable().default(null)}).strict().refine(o=>(o.width===null)===(o.height===null),'Podaj obie krawędzie obrazu');
export type ExportOptions=z.infer<typeof exportOptionsSchema>;
export type ExportProfile={id:string;name:string;options:ExportOptions};
export const defaultExport:ExportOptions={width:null,height:null,crf:18,speed:'medium',audioKbps:192,fit:'fit',captions:'burn',targetMb:null};
export const exportProfiles:ExportProfile[]=[{id:'project',name:'Format montażu',options:defaultExport},{id:'reel',name:'Reels / TikTok / Shorts · 1080p',options:{...defaultExport,width:1080,height:1920}},{id:'youtube',name:'YouTube / Facebook · 1080p',options:{...defaultExport,width:1920,height:1080}},{id:'4k',name:'YouTube · 4K',options:{...defaultExport,width:3840,height:2160}},{id:'share',name:'Szybkie udostępnianie · 720p',options:{...defaultExport,width:1280,height:720,crf:24,speed:'fast',audioKbps:128}},{id:'archive',name:'Archiwum · wysoka jakość',options:{...defaultExport,crf:15,speed:'slow',audioKbps:256}}];
export type StudioItem={id:number;name:string;state:string;message:string;progress:number|null;outputPath:string;srtPath:string|null;retryable:boolean};
export const studioActive=(s:string)=>['preparing','queued','rendering','cancelling'].includes(s);
export const outputSize=(o:ExportOptions,size:{width:number;height:number})=>({width:o.width!==null&&Number.isFinite(o.width)?Math.max(128,o.width):size.width,height:o.height!==null&&Number.isFinite(o.height)?Math.max(128,o.height):size.height});
export function exportWarnings(p:Project,o:ExportOptions,size:{width:number;height:number}){
 const out=outputSize(o,size),notes:string[]=[];
 if(Math.abs(out.width/out.height-size.width/size.height)>.01)notes.push(o.fit==='fit'?'Inne proporcje: obraz zostanie dopasowany z pasami. Sprawdź podgląd.':'Inne proporcje: środek obrazu zostanie przycięty. Sprawdź podgląd.');
 if(out.width>size.width||out.height>size.height)notes.push('Rozdzielczość wyjścia jest większa od formatu montażu. Powiększenie nie doda szczegółów.');
 if(p.masterAudio.normalization?.stale)notes.push('Miks zmienił się od ostatniej normalizacji. Możesz zmierzyć go ponownie przed dodaniem do kolejki.');
 return notes;
}
/** CRF is content dependent: a deliberately broad planning range, not a target or guarantee. */
export function estimatedSize(o:ExportOptions,size:{width:number;height:number},duration:number){const s=outputSize(o,size),rate=s.width*s.height*30*.06*Math.pow(2,(23-o.crf)/6),audio=o.audioKbps*1000;return {low:(rate*.4+audio)*duration/8/1e6,high:(rate*2.5+audio)*duration/8/1e6};}

export function sizeBudget(o:ExportOptions,size:{width:number;height:number},duration:number){
 if(o.targetMb==null)return null;
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(o.targetMb)||o.targetMb<.25||o.targetMb>32000)return {error:'Nieprawidłowy limit MB lub długość montażu',videoBps:0,lowQuality:false};
 const bytes=Math.floor(o.targetMb*1e6),videoBps=Math.min(200e6,Math.floor((bytes-Math.max(bytes*.04,65536))*8/duration-o.audioKbps*1000)),out=outputSize(o,size);
 return {error:videoBps<64000?'Limit MB jest za mały dla dźwięku i obrazu. Zwiększ limit lub zmniejsz bitrate AAC.':'',videoBps,lowQuality:videoBps/(out.width*out.height*30)<.035};
}
export type ExportMeasurement={index:number;label:string;options:ExportOptions;bytes:number;encodeSeconds:number;estimatedMb:[number,number];estimatedSeconds:[number,number]};
export type ExportComparisonReport={comparison:{range:{start:number;duration:number};measurements:ExportMeasurement[];compositionSeconds:number};paths:string[]};
