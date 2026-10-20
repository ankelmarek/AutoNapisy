import {styleSchema,type Project} from './model';
import {compositionSegments} from './editing';
import {synchronizedWords} from './captionAnimation';
import type {CaptionStyle} from './captions';
export const animatedPresets=[
 {id:'karaoke-flow',name:'Karaoke Flow',description:'Bieżące słowo w kolorze akcentu',fontFamily:'Bebas Neue',fontSize:56,accent:'#ffe600',uppercase:true},
 {id:'pop-beat',name:'Pop Beat',description:'Sprężysty akcent każdego słowa',fontFamily:'Bebas Neue',fontSize:64,accent:'#b4ff58',uppercase:true},
 {id:'impact',name:'Impact',description:'Mocny zoom haseł po 1–3 słowa',fontFamily:'Bebas Neue',fontSize:84,accent:'#ffdf00',uppercase:true},
 {id:'neon',name:'Neon Pulse',description:'Cyjan, fiolet i subtelny puls',fontFamily:'Segoe UI',fontSize:43,accent:'#a572ff',uppercase:false},
 {id:'slide-reveal',name:'Slide Reveal',description:'Płynne odsłonięcie od dołu',fontFamily:'Arial',fontSize:46,accent:'#66d9ff',uppercase:false},
 {id:'marker',name:'Marker',description:'Zakreślacz rosnący pod słowem',fontFamily:'Arial',fontSize:40,accent:'#f8c849',uppercase:false},
 {id:'editorial',name:'Editorial Clean',description:'Lekki fade i elegancka typografia',fontFamily:'Georgia',fontSize:36,accent:'#e6cf9d',uppercase:false},
 {id:'type-flow',name:'Type Flow',description:'Słowa dołączają bez zmiany układu',fontFamily:'Arial',fontSize:42,accent:'#76e9d4',uppercase:false},
] as const;
export type AnimatedPresetId=typeof animatedPresets[number]['id'];
export function presetStyle(base:CaptionStyle,id:AnimatedPresetId):CaptionStyle{
 const p=animatedPresets.find(p=>p.id===id)!;
 return styleSchema.parse({...base,fontFamily:p.fontFamily,fontSize:p.fontSize,color:id==='marker'?'#151319':'#ffffff',background:id==='marker'?'#f4f0e6':'#111827',effect:id==='marker'||id==='type-flow'?'box':'outline',outlineColor:id==='neon'?'#21123a':'#080808',outlineWidth:id==='editorial'||id==='marker'||id==='type-flow'?0:id==='neon'?1:3,uppercase:p.uppercase,cornerRadius:id==='marker'?6:12,marginPercent:8,boxWidth:84,maxLines:2,wordsPerCard:8,animation:{preset:id,version:1,accentColor:p.accent,speed:1,intensity:1}});
}
/** Only style references change. Timing, text, word data and source media stay untouched. */
export function applyCaptionStyle(project:Project,style:CaptionStyle,ids:readonly string[]|null,id:string=crypto.randomUUID()):Project{
 if(project.tracks.T?.locked)throw Error('Ścieżka napisów jest zablokowana.');
 const nextStyle=styleSchema.parse(style),segments=compositionSegments(project),selected=ids===null?segments:segments.filter(s=>ids.includes(s.id));
 if(!selected.length&&ids!==null)throw Error('Wybierz napis lub dodaj transkrypcję przed zastosowaniem stylu.');
 if(!selected.length)return {...project,styles:{...project.styles,default:nextStyle}};
 const key=`caption-${id}`;if(project.styles[key])throw Error('Identyfikator stylu jest już zajęty.');
 const edits={...project.captionEdits};for(const s of selected)edits[s.id]={...(edits[s.id]??{trimStart:0,trimEnd:0}),styleId:key};
 const used=new Set(['default',...project.segments.map(s=>s.styleId),...project.assets.flatMap(a=>a.segments.map(s=>s.styleId)),...(project.timelineSegments??[]).map(s=>s.styleId),...Object.values(edits).flatMap(e=>e.styleId?[e.styleId]:[])]);
 return {...project,styles:Object.fromEntries(Object.entries({...project.styles,...(ids===null?{default:nextStyle}:{}),[key]:nextStyle}).filter(([id])=>used.has(id))),captionEdits:edits};
}
export function captionFallbackCount(p:Project,ids:readonly string[]|null){return compositionSegments(p).filter(s=>(ids===null||ids.includes(s.id))&&!synchronizedWords(s,p.styles[s.styleId])).length;}

/** Explicit split/copy origins preserve the style in source time; no inferred word timing. */
export function inheritCaptionStyles(before:Project,next:Project,origins:ReadonlyMap<string,string>):Project{
 if(before.timelineSegments||next.timelineSegments||!origins.size)return next;
 const rawBefore=compositionSegments({...before,captionEdits:{}}),rawAfter=compositionSegments({...next,captionEdits:{}}),edits={...next.captionEdits},styles={...next.styles};
 for(const s of rawAfter){const origin=origins.get(s.clipId);if(!origin)continue;const a=before.clips?.find(c=>c.id===origin),b=next.clips?.find(c=>c.id===s.clipId);if(!a||!b)continue;
  const from=a.start-a.sourceIn,to=b.start-b.sourceIn,lo=s.start-to,hi=s.end-to,candidates=rawBefore.filter(o=>o.clipId===origin&&o.sourceId===s.sourceId&&o.start-from<hi-1e-7&&o.end-from>lo+1e-7);
  const ids=[...new Set(candidates.map(o=>before.captionEdits[o.id]?.styleId??o.styleId))];
  if(ids.length>1)throw Error('Fragment łączy różne style napisów. Podziel go na granicy stylów.');
  const id=ids[0];if(id&&before.styles[id]&&id!==s.styleId){styles[id]=before.styles[id];edits[s.id]={...(edits[s.id]??{trimStart:0,trimEnd:0}),styleId:id};}
 }
 return {...next,styles,captionEdits:edits};
}
