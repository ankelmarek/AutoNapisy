import {projectSchema,type Project} from './model';
import {clipEnd,clipMedia,compositionSegments,projectClips,MIN_CLIP,type Clip} from './editing';
import {assertUnlockedEdit,clipLocked,clipMuted,clipTracks} from './trackControls';
import {rippleTrack,trackParticipates,trackViews,captionRipple,type EditChange} from './ripple';
import {reconcileTransitions} from './effects';
import {addTrack} from './tracks';
import {trackId,tracksOf} from './trackModel';
export type SmartCutRequest={kind:'range';id:string;from:number;to:number}|{kind:'join';id:string;toId:string;at:number};
export type CutOptions={ripple:boolean;captions:boolean;token:string};
export type CutPlan={base:Project;next:Project;from:number;to:number;join:number;track:number;active:boolean;changes:EditChange[];conflicts:string[];notes:string[];removedTransitions:number};
export type Pause={start:number;end:number};
export type EdgeAnalysis={boundary:number;from:number;to:number;pauses:Pause[];available:boolean;message:string};
export type CutAnalysis={key:string;edges:EdgeAnalysis[]};
export const frameTime=(n:number)=>Math.round(n*30)/30;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function joinAfter(p:Project,id:string){const a=projectClips(p).find(c=>c.id===id);return a&&projectClips(p).find(b=>b.kind!=='audio'&&b.id!==id&&(b.track??0)===(a.track??0)&&Math.abs(b.start-clipEnd(a))<1e-6);}
export function defaultCutRequest(p:Project,id:string,time:number):SmartCutRequest{
 const c=projectClips(p).find(c=>c.id===id);if(!c||c.kind==='audio')throw Error('Zaznacz klip wideo.');
 const at=Math.max(c.start,Math.min(time,clipEnd(c))),from=Math.max(c.start,at-.4),to=Math.min(clipEnd(c),Math.max(from+2/30,at+.4));
 return {kind:'range',id,from:frameTime(from),to:frameTime(to)};
}
/** Remap existing source-caption patches through source clocks, never through a guessed word time. */
function remapEdits(before:Project,next:Project,origins:Map<string,string>,conflicts:string[]){
 if(before.timelineSegments||!Object.keys(before.captionEdits).length)return next;
 const oldRaw=compositionSegments({...before,captionEdits:{}}),raw=compositionSegments({...next,captionEdits:{}}),edits={...before.captionEdits};
 for(const s of raw){const origin=origins.get(s.clipId)??s.clipId,c=projectClips(next).find(c=>c.id===s.clipId),old=projectClips(before).find(c=>c.id===origin);if(!c||!old)continue;
 const offset=c.start-c.sourceIn,previous=old.start-old.sourceIn,lo=s.start-offset,hi=s.end-offset;
 const candidates=oldRaw.filter(o=>o.clipId===origin&&o.sourceId===s.sourceId&&o.start-previous<hi-1e-7&&o.end-previous>lo+1e-7);
 if(!candidates.some(o=>before.captionEdits[o.id]))continue;
 const offsets=[...new Set(candidates.map(o=>before.captionEdits[o.id]?.offset??0))];
 if(offsets.length>1){conflicts.push('Napisy mają różne przesunięcia. Rozdziel zakres cięcia.');continue;}
 delete edits[s.id];
 const bounds=[lo,hi,...candidates.flatMap(o=>{const e=before.captionEdits[o.id];return [o.start-previous,o.end-previous,...(e?[o.start+e.trimStart-previous,o.end-e.trimEnd-previous]:[])];})].filter(t=>t>=lo&&t<=hi).sort((a,b)=>a-b).filter((t,i,a)=>!i||t-a[i-1]>1e-7);
 const fragments:{start:number;end:number;text?:string;styleId?:string}[]=[];
 for(let i=0;i<bounds.length-1;i++){const start=bounds[i],end=bounds[i+1],mid=(start+end)/2,o=candidates.find(o=>mid>=o.start-previous&&mid<o.end-previous),patch=o&&before.captionEdits[o.id];
 if(patch&&(patch.hidden||mid<o!.start+patch.trimStart-previous||mid>o!.end-patch.trimEnd-previous))continue;
 const text=patch?.text??(patch&&(patch.trimStart>0||patch.trimEnd>0)?o!.text:undefined),styleId=patch?.styleId,last=fragments.at(-1);
 if(last&&Math.abs(last.end-start)<1e-6&&last.text===text&&last.styleId===styleId)last.end=end;else fragments.push({start,end,text,styleId});}
 if(!fragments.length){edits[s.id]={trimStart:0,trimEnd:0,hidden:true};continue;}
 if(fragments.length>1){conflicts.push('Edycja napisu po zmianie widocznych warstw wymaga osobnego zakresu. Zmniejsz zaznaczenie.');continue;}
 const f=fragments[0];edits[s.id]={trimStart:Math.max(0,f.start-lo),trimEnd:Math.max(0,hi-f.end),...(offsets[0]?{offset:offsets[0]}:{}),...(f.text!==undefined?{text:f.text}:{}),...(f.styleId?{styleId:f.styleId}:{})};
 }
 return {...next,captionEdits:edits};
}
export function cutChanges(before:Project,next:Project):EditChange[]{
 const result:EditChange[]=[];for(const c of projectClips(before)){const n=projectClips(next).find(x=>x.id===c.id);if(!equal(c,n))result.push({id:c.id,track:clipTracks(c).join('/'),before:c.start,after:n?.start??c.start,oldEnd:clipEnd(c),newEnd:n?clipEnd(n):c.start,removed:!n});}
 for(const c of projectClips(next))if(!projectClips(before).some(x=>x.id===c.id))result.push({id:c.id,track:clipTracks(c).join('/'),before:c.start,after:c.start,oldEnd:c.start,newEnd:clipEnd(c),removed:false});
 const captions=compositionSegments(next);for(const c of compositionSegments(before)){const n=captions.find(s=>s.id===c.id);if(!n||!equal(c,n))result.push({id:c.id,track:'T',before:c.start,after:n?.start??c.start,oldEnd:c.end,newEnd:n?.end??c.start,removed:!n,caption:true});}return result;
}
export function planSmartCut(p:Project,request:SmartCutRequest,options:CutOptions):CutPlan{
 const clips=projectClips(p),c=clips.find(c=>c.id===request.id),conflicts:string[]=[],notes:string[]=[];
 if(!c||c.kind==='audio')throw Error('SmartCut wymaga zaznaczonego filmu.');
 if(clipLocked(p,c))throw Error('Odblokuj ścieżkę filmu i jego dźwięku.');
 const origins=new Map<string,string>(),parts=new Map<string,Clip[]>(),unique=(id:string,suffix:string)=>{const next=`sc:${options.token}:${clips.findIndex(c=>c.id===id)}:${suffix}`;if(clips.some(c=>c.id===next))throw Error('Konflikt identyfikatora cięcia. Otwórz SmartCut ponownie.');return next;};
 let from=request.kind==='range'?frameTime(request.from):frameTime(request.at),to=request.kind==='range'?frameTime(request.to):from,active=false,next=p;
 if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<from)throw Error('Nieprawidłowe granice SmartCut.');
 const touchedTransition=(a:number,b:number)=>p.transitions.some(t=>{const incoming=clips.find(c=>c.id===t.toId)!;return a<incoming.start+1/30&&b>incoming.start-t.duration-1/30;});
 if(touchedTransition(from,to===from?to+1/30:to))conflicts.push('Zakres przecina istniejące przejście. Ustaw granice poza jego obszarem.');
 if(request.kind==='join'){
  const b=clips.find(x=>x.id===request.toId);if(!b||b.kind==='audio'||(b.track??0)!==(c.track??0)||Math.abs(c.start+c.sourceOut-c.sourceIn-b.start)>1e-6)throw Error('Wybierz sąsiadujące filmy na jednej ścieżce.');
  const delta=from-b.start;
  if(Math.abs(delta)>.8+1e-6||c.sourceOut+delta>(clipMedia(p,c)?.duration??0)+1e-6||c.sourceOut+delta-c.sourceIn<MIN_CLIP-1e-6||b.sourceIn+delta< -1e-6||b.sourceOut-b.sourceIn-delta<MIN_CLIP-1e-6)conflicts.push('Przesunięcie połączenia wychodzi poza dostępne klatki źródła.');
  if(Math.abs(delta)>1e-7&&(c.syncGroup||b.syncGroup))conflicts.push('Połączenie z odłączonym audio zachowuje ręczną granicę. Najpierw dopasuj jego J/L-cut osobno.');
  next={...p,clips:clips.map(x=>x.id===c.id?{...x,sourceOut:x.sourceOut+delta}:x.id===b.id?{...x,start:x.start+delta,sourceIn:x.sourceIn+delta}:x)};
 }else{
  if(to-from<2/30-1e-6||from<c.start-1/30||to>clipEnd(c)+1/30)throw Error('Zaznacz co najmniej dwie klatki w jednym klipie.');
  from=Math.max(c.start,from);to=Math.min(clipEnd(c),to);if(to-from<2/30-1e-6)throw Error('Zaznacz co najmniej dwie klatki w jednym klipie.');active=options.ripple&&trackParticipates(rippleTrack(p,clipTracks(c)[0]));
  const enabled=new Set(active?trackViews(p).filter(trackParticipates).map(t=>t.id):[]),amount=to-from;
  const participates=(x:Clip)=>x.kind!=='audio'&&(x.track??0)===(c.track??0)||enabled.has(clipTracks(x)[0]);
  const cut=(x:Clip,a:number,b:number,shift:boolean):Clip[]=>{
   const end=clipEnd(x),out:Clip[]=[];if(end<=a+1e-7)return [{...x}];if(x.start>=b-1e-7)return [{...x,start:x.start-(shift?amount:0)}];
   const left=Math.min(end,a)-x.start,right=end-Math.max(x.start,b);
   if(left>=MIN_CLIP-1e-6)out.push({...x,sourceOut:x.sourceIn+left});else if(left>1e-6)conflicts.push('Przy granicy pozostałby fragment krótszy niż dwie klatki.');
   if(right>=MIN_CLIP-1e-6){const start=Math.max(x.start,b);out.push({...x,id:out.length?unique(x.id,'tail'):x.id,start:start-(shift?amount:0),sourceIn:x.sourceIn+start-x.start});}else if(right>1e-6)conflicts.push('Przy granicy pozostałby fragment krótszy niż dwie klatki.');
   return out;
  };
  for(const x of clips){if(x.kind==='audio'&&x.syncGroup&&clips.some(v=>v.kind!=='audio'&&v.syncGroup===x.syncGroup))continue;parts.set(x.id,participates(x)?cut(x,from,to,active):[x]);}
  for(const x of clips.filter(x=>x.kind==='audio'&&x.syncGroup&&clips.some(v=>v.kind!=='audio'&&v.syncGroup===x.syncGroup))){
   const pictures=clips.filter(v=>v.kind!=='audio'&&v.syncGroup===x.syncGroup),sounds=clips.filter(v=>v.kind==='audio'&&v.syncGroup===x.syncGroup);
   if(pictures.length!==1||sounds.length!==1){if(pictures.some(participates))conflicts.push('Powiązanie zawiera już wiele fragmentów. Wybierz zakres poza tą grupą.');parts.set(x.id,[x]);continue;}
   const picture=pictures[0],after=parts.get(picture.id)!;
   if(equal(after,[picture])){parts.set(x.id,enabled.has(clipTracks(x)[0])&&!pictures.some(participates)?cut(x,from,to,active):[x]);continue;}
   if(!after.length){parts.set(x.id,[]);notes.push('Usunięcie całego obrazu obejmie również jego powiązany dźwięk.');continue;}
   const offset=x.start-x.sourceIn-(picture.start-picture.sourceIn),overlap=picture.start<to-1e-7&&clipEnd(picture)>from+1e-7;
   const audio=overlap?cut(x,from+offset,to+offset,active):[...cut(x,Infinity,Infinity,false).map(a=>({...a,start:a.start+(after[0].start-after[0].sourceIn-(picture.start-picture.sourceIn))}))];
   for(const v of after){const base=v.start-v.sourceIn,peers=audio.filter(a=>Math.abs(a.start-a.sourceIn-base-offset)<1e-6&&(after.length===1||a.sourceIn<v.sourceOut-1e-6&&a.sourceOut>v.sourceIn+1e-6));const group=unique(picture.id,v.id===picture.id?'sync-left':'sync-right');v.syncGroup=group;for(const a of peers)a.syncGroup=group;}
   if(audio.some(a=>a.syncGroup===x.syncGroup))conflicts.push('Pozostałby samotny fragment J/L-cut bez odpowiadającego obrazu. Zmień granice zaznaczenia.');
   parts.set(x.id,audio);
  }
  const result=clips.flatMap(x=>parts.get(x.id)??[x]);for(const [origin,out] of parts)for(const x of out)origins.set(x.id,origin);
  const transitions=p.transitions.flatMap(t=>{const a=parts.get(t.fromId)?.at(-1),b=parts.get(t.toId)?.[0];return a&&b?[{...t,fromId:a.id,toId:b.id}]:[];});
  next={...p,clips:result,transitions};
  if(active&&options.captions){if(p.tracks.T?.locked)conflicts.push('Odblokuj T, aby przesunąć napisy montażu.');else next=captionRipple(next,from,to,-amount);}
  if(p.timelineSegments&&active&&!options.captions)notes.push('Napisy montażu T pozostaną w dotychczasowych czasach.');
  if(options.ripple&&!active)notes.push('Ten tor nie uczestniczy w Ripple — po wycięciu pozostanie luka.');
  if(!active)notes.push('Dosuwanie wyłączone: pozostałe pozycje klipów są zachowane.');
 }
 next=remapEdits(p,next,origins,conflicts);next={...next,transitions:reconcileTransitions(next,projectClips(next))};
 if(next.clips!.length>100)conflicts.push('Wynik przekroczyłby limit 100 klipów.');
 try{assertUnlockedEdit(p,next);}catch(e){conflicts.push(String(e));}
 const valid=projectSchema.safeParse(next);if(!valid.success)conflicts.push('Granice powodują konflikt klipów, powiązań lub napisów. Zmień zakres.');
 return {base:p,next,from,to,join:from,track:c.track??0,active,conflicts:[...new Set(conflicts)],notes:[...new Set(notes)],changes:cutChanges(p,next),removedTransitions:p.transitions.length-next.transitions.length};
}
/** A true short linear audio overlap, using existing native crossfade envelopes. Picture remains a hard cut. */
export function smoothSmartCut(plan:CutPlan,options:CutOptions):CutPlan{
 const conflicts=[...plan.conflicts],notes=[...plan.notes];let p=plan.next;const clips=projectClips(p),at=plan.join;
 const lane=plan.track;
 const left=clips.find(c=>c.kind!=='audio'&&(c.track??0)===lane&&Math.abs(clipEnd(c)-at)<1e-6),right=clips.find(c=>c.kind!=='audio'&&(c.track??0)===lane&&Math.abs(c.start-at)<1e-6);
 if(!left||!right)return {...plan,conflicts:[...conflicts,'Wygładzenie wymaga dwóch sąsiadujących fragmentów obrazu.']};
 const half=2/30,duration=2*half;
 const original=projectClips(plan.base),source=original.find(c=>c.kind!=='audio'&&(c.track??0)===lane&&c.start<=plan.from+1e-6&&clipEnd(c)>=plan.to-1e-6),edgeWords=(v:Clip,at:number)=>{const c=original.find(c=>c.id===v.id)??source;return c?wordsAt(plan.base,c.id,at):[];};
 if(edgeWords(left,plan.from).some(w=>w.start<plan.from+half-1e-6&&w.end>plan.from+1e-6)||edgeWords(right,plan.to).some(w=>w.start<plan.to-1e-6&&w.end>plan.to-half+1e-6))return {...plan,conflicts:[...conflicts,'Crossfade przywróciłby fragment usuwanego słowa. Poszerz margines pauzy albo wybierz Naturalne.']};
 const sound=(v:Clip):Clip|undefined=>v.audioDetached?clips.find(c=>c.kind==='audio'&&c.syncGroup===v.syncGroup&&Math.abs(c.start-v.start)<1e-6&&Math.abs(clipEnd(c)-clipEnd(v))<1e-6):v;
 const a=sound(left),b=sound(right);
 if(!a||!b||clipMuted(p,a)||clipMuted(p,b)||a.crossfade?.fadeOut||b.crossfade?.fadeIn||a.sourceOut+half>(clipMedia(p,a)?.duration??0)+1e-6||b.sourceIn<half-1e-6||b.start<half-1e-6||a.sourceOut-a.sourceIn<duration||b.sourceOut-b.sourceIn<duration)return {...plan,conflicts:[...conflicts,'Brak zgodnych granic J/L, słyszalnego audio lub zapasu źródła do 4-klatkowego crossfade.']};
 const detach=(v:Clip,s:Clip):Clip=>{
  if(s.kind==='audio')return s;
  let bus=v.audioRoute&&v.audioRoute!=='embedded'?tracksOf(p,'audio').find(t=>t.id===v.audioRoute):undefined;
  if(!bus){bus=tracksOf(p,'audio').find(t=>!p.tracks[t.id]?.locked&&!p.tracks[t.id]?.muted&&!projectClips(p).some(c=>c.kind==='audio'&&(c.track??0)===t.index&&c.start<clipEnd(v)+half&&clipEnd(c)>v.start-half));if(!bus){p=addTrack(p,'audio');bus=tracksOf(p,'audio').at(-1)!;}}
  if(p.tracks[bus.id]?.locked)throw Error('Docelowa ścieżka audio jest zablokowana.');
  const group=`sc:${options.token}:${clips.findIndex(c=>c.id===v.id)}:voice-group`,audio:Clip={...v,id:`sc:${options.token}:${clips.findIndex(c=>c.id===v.id)}:voice`,kind:'audio',track:bus.index,audioRoute:undefined,audioDetached:undefined,syncGroup:group};
  p={...p,clips:[...projectClips(p).map(c=>c.id===v.id?{...c,audioDetached:true,audioRoute:'embedded',syncGroup:group}:c),audio]};return audio;
 };
 try{const first=detach(left,a),second=detach(right,b);p={...p,clips:projectClips(p).map(c=>c.id===first.id?{...c,sourceOut:c.sourceOut+half,crossfade:{...c.crossfade,fadeOut:{anchor:c.sourceOut+half,duration}}}:c.id===second.id?{...c,start:c.start-half,sourceIn:c.sourceIn-half,crossfade:{...c.crossfade,fadeIn:{anchor:c.sourceIn-half,duration}}}:c)};assertUnlockedEdit(plan.base,p);if(!projectSchema.safeParse(p).success)throw Error('Crossfade nie mieści się w granicach projektu.');notes.push('Obraz: ostre cięcie. Audio: liniowy crossfade 4 klatek (0,133 s). Połączony dźwięk staje się widocznymi klipami A, z zachowaniem obwiedni.');}catch(e){conflicts.push(String(e));}
 return {...plan,next:p,conflicts:[...new Set(conflicts)],notes,changes:cutChanges(plan.base,p)};
}
function wordsAt(p:Project,id:string,at:number){
 const c=projectClips(p).find(c=>c.id===id)!;const segments=p.timelineSegments??(c.assetId?p.assets.find(a=>a.id===c.assetId)?.segments??[]:p.segments);
 const offset=p.timelineSegments?0:c.start-c.sourceIn;
 return segments.flatMap(s=>s.words.map(w=>({start:w.start+offset,end:w.end+offset}))).filter(w=>w.end>at-1.5&&w.start<at+1.5);
}
export function naturalSmartCut(p:Project,r:SmartCutRequest,analysis:CutAnalysis):{request:SmartCutRequest|null;reason:string;pauses:Pause[]}{
 const clips=projectClips(p),c=clips.find(c=>c.id===r.id)!;
 const pick=(edge:EdgeAnalysis,id:string,lo:number,hi:number)=>{
  const words=wordsAt(p,id,edge.boundary);if(!words.length)return null;
  const candidates=edge.pauses.flatMap(pause=>{const start=Math.max(lo,pause.start+1/30),end=Math.min(hi,pause.end-1/30);if(end<start)return [];const time=frameTime(Math.max(start,Math.min(edge.boundary,end)));if(time<start-1e-6||time>end+1e-6||Math.abs(time-edge.boundary)>.6||words.some(w=>time>w.start-1/60&&time<w.end+1/60))return [];return [{time,pause}];});return candidates.sort((a,b)=>Math.abs(a.time-edge.boundary)-Math.abs(b.time-edge.boundary))[0]??null;
 };
 if(analysis.edges.length!==2||analysis.edges.some(e=>!e.available))return {request:null,reason:'Brak pomiaru dźwięku obu granic. Dostępne pozostaje cięcie dokładne.',pauses:[]};
 if(r.kind==='range'){const a=pick(analysis.edges[0],r.id,c.start,clipEnd(c)-2/30),b=pick(analysis.edges[1],r.id,c.start+2/30,clipEnd(c));if(!a||!b||b.time-a.time<2/30-1e-6)return {request:null,reason:'Brak potwierdzonej pauzy poza słowami. Ustaw granice ręcznie lub wybierz Dokładne.',pauses:[]};return {request:{...r,from:a.time,to:b.time},reason:'Granice oparte na zmierzonych pauzach i czasach słów.',pauses:[a.pause,b.pause]};}
 const b=clips.find(c=>c.id===r.toId)!;const a=pick(analysis.edges[0],r.id,r.at-.6,r.at+.6),right=pick(analysis.edges[1],r.toId,r.at-.6,r.at+.6);
 if(!a||!right)return {request:null,reason:'Oba źródła muszą potwierdzać pauzę i czasy słów.',pauses:[]};
 const start=Math.max(a.pause.start,right.pause.start)+1/30,end=Math.min(a.pause.end,right.pause.end)-1/30,at=frameTime(Math.max(start,Math.min(r.at,end)));
 if(end<start||at<start||at>end||wordsAt(p,r.id,at).some(w=>at>w.start-1/60&&at<w.end+1/60)||wordsAt(p,b.id,at).some(w=>at>w.start-1/60&&at<w.end+1/60))return {request:null,reason:'Pauzy po obu stronach nie mają wspólnej bezpiecznej granicy.',pauses:[]};return {request:{...r,at},reason:'Wspólna pauza obu źródeł, poza słowami.',pauses:[a.pause,right.pause]};
}
/** Render only a short real section; no artificial concatenation of the before view. */
export function smartCutWindow(p:Project,at:number){
 let from=Math.max(0,frameTime(at-2)),to=Math.min(Math.max(0,...projectClips(p).map(clipEnd)),frameTime(at+2));
 for(const t of p.transitions){const incoming=projectClips(p).find(c=>c.id===t.toId)!;if(from>incoming.start-t.duration&&from<incoming.start)from=incoming.start-t.duration;if(to>incoming.start-t.duration&&to<incoming.start)to=incoming.start;}
 const clips=projectClips(p).flatMap(c=>{const start=Math.max(c.start,from),end=Math.min(clipEnd(c),to);return end-start>=MIN_CLIP-1e-6?[{...c,start:start-from,sourceIn:c.sourceIn+start-c.start,sourceOut:c.sourceOut-(clipEnd(c)-end)}]:[];});
 const segments=compositionSegments(p).flatMap(s=>{const start=Math.max(from,s.start),end=Math.min(to,s.end);return end-start>=MIN_CLIP-1e-6?[{id:s.id,text:s.text,styleId:s.styleId,start:start-from,end:end-from,words:s.words.filter(w=>w.start>=start&&w.end<=end).map(w=>({...w,start:w.start-from,end:w.end-from}))}]:[];});
 const next={...p,clips,transitions:reconcileTransitions(p,clips),timelineSegments:segments,captionEdits:{}};return {project:next,offset:from};
}
