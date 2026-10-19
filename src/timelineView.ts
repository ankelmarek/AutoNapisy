import type {TrackKind} from './trackModel';
export const TIMELINE_VIEW_KEY='rolvixa.timeline.v1';
export type TimelineView={heights:Record<string,number>;compact:string[]};
export const defaultTimelineView=():TimelineView=>({heights:{},compact:[]});
export function boundedHeight(kind:TrackKind,value:number,embedded=false){return Math.round(Math.max(kind==='audio'?40:embedded?84:40,Math.min(240,Number.isFinite(value)?value:kind==='audio'?56:84)));}
export function parseTimelineView(raw:string|null):TimelineView{
 try{const p=JSON.parse(raw??'null');if(p?.version!==1||!p.heights||typeof p.heights!=='object'||Array.isArray(p.heights)||!Array.isArray(p.compact))return defaultTimelineView();
 const heights:Record<string,number>={};for(const [id,value] of Object.entries(p.heights)){if(/^[VA]([1-9]|1[0-6])$/.test(id)&&typeof value==='number'&&Number.isFinite(value))heights[id]=boundedHeight(id.startsWith('A')?'audio':'video',value);}
 return {heights,compact:[...new Set<string>(p.compact.filter((id:unknown)=>typeof id==='string'&&/^[VA]([1-9]|1[0-6])$/.test(id)))]};
 }catch{return defaultTimelineView();}
}
export function readTimelineView(){try{return parseTimelineView(localStorage.getItem(TIMELINE_VIEW_KEY));}catch{return defaultTimelineView();}}
export function writeTimelineView(view:TimelineView){try{localStorage.setItem(TIMELINE_VIEW_KEY,JSON.stringify({version:1,...view}));}catch{/* A view preference cannot invalidate a project edit. */}}
export const fitTimelineZoom=(duration:number,width:number)=>Math.min(160,Math.max(.001,(Math.max(1,width)-32)/Math.max(.05,duration)));
