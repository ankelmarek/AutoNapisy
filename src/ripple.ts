import {projectSchema,type Project} from './model';
import {clipEnd,clipMedia,compositionSegments,projectClips,trimClip,MIN_CLIP,type Clip} from './editing';
import {clipLocked,clipTracks,type TrackId} from './trackControls';
import {reconcileTransitions} from './effects';
export type RippleMode='auto'|'on'|'off';
export type TrackView={id:string;locked:boolean;mode:RippleMode;starts:number[]};
/** Generic policy: the algorithm accepts any number of named tracks. */
export function trackParticipates(t:TrackView){return !t.locked&&(t.mode==='on'||(t.mode==='auto'&&t.starts.length>0&&Math.min(...t.starts)<=1/60+1e-8));}
export function trackViews(p:Project):TrackView[]{
 const clips=projectClips(p),ids=new Set<string>([...Object.keys(p.tracks),...clips.flatMap(clipTracks),'T']);
 return [...ids].map(id=>{const state=p.tracks[id as TrackId];return {id,locked:!!state?.locked,mode:state?.ripple??'auto',starts:id==='T'?(p.timelineSegments??[]).map(s=>s.start):clips.filter(c=>clipTracks(c).includes(id as TrackId)).map(c=>c.start)};});
}
export const rippleTrack=(p:Project,id:TrackId)=>trackViews(p).find(t=>t.id===id)??{id,locked:!!p.tracks[id]?.locked,mode:p.tracks[id]?.ripple??'auto',starts:[]};
export function rippleReason(t:TrackView){return t.locked?'Ścieżka zablokowana':t.mode==='off'?'R wyłączone ręcznie':t.mode==='on'?'R włączone ręcznie':!t.starts.length?'R wyłączone — pusta ścieżka':trackParticipates(t)?'R automatyczne — ścieżka od 00:00':'R wyłączone — ścieżka zaczyna się później';}
export type EditOperation={kind:'delete';id:string}|{kind:'trim';id:string;edge:'left'|'right';delta:number};
export type EditChange={id:string;track:string;before:number;after:number;oldEnd:number;newEnd:number;removed:boolean;caption?:boolean};
export type RipplePlan={base:Project;next:Project;plain:Project;operation:EditOperation;active:boolean;conflicts:string[];changes:EditChange[];delta:number;removedTransitions:number};
const tidy=(p:Project,clips:Clip[]):Project=>({...p,clips,transitions:reconcileTransitions(p,clips)});
function captionRipple(p:Project,at:number,until:number,delta:number):Project {
 if(!p.timelineSegments)return p;
 // A removed interval collapses, with each word moved once. An expansion inserts time at 'at'.
 const removed=delta<0;
 const map=(t:number)=>removed?(t<=at?t:t>=until?t+delta:at):(t>=at?t+delta:t);
 const edits={...p.captionEdits};
 const segments=p.timelineSegments.flatMap(s=>{
  const start=map(s.start),end=map(s.end),key='timeline:'+s.id,patch=edits[key];if(end-start<MIN_CLIP-1e-6){delete edits[key];return [];}
  if(patch)edits[key]={...patch,trimStart:Math.max(0,map(s.start+patch.trimStart)-start),trimEnd:Math.max(0,end-map(s.end-patch.trimEnd))};
  const words=s.words.filter(w=>!removed||w.end<=at+1e-7||w.start>=until-1e-7).map(w=>({...w,start:map(w.start),end:map(w.end)}));
  return [{...s,start,end,words,text:s.words.length?words.map(w=>w.text).join(' ').trim():s.text}];
 }).filter(s=>s.text.trim());
 return {...p,timelineSegments:segments,captionEdits:edits};
}
export function planEdit(p:Project,operation:EditOperation,useRipple=p.rippleEnabled):RipplePlan {
 const clips=projectClips(p),c=clips.find(x=>x.id===operation.id);
 if(!c)throw Error('Nie znaleziono klipu.');
 if(clipLocked(p,c))throw Error('Odblokuj ścieżkę przed edycją.');
 const regular=operation.kind==='delete'?clips.filter(x=>x.id!==c.id):trimClip(clips,c.id,operation.edge,operation.delta,clipMedia(p,c)?.duration??0);
 const plain=tidy(p,regular),primary=clipTracks(c)[0],views=trackViews(p),enabled=new Set(views.filter(trackParticipates).map(t=>t.id));
 let next=plain,delta=0,at=c.start,until=clipEnd(c),active=useRipple&&enabled.has(primary);
 const conflicts:string[]=[];
 if(active){
  let edited:Clip|undefined;
  if(operation.kind==='delete'){delta=c.sourceIn-c.sourceOut;}
  else {
   const d=clipMedia(p,c)?.duration??0;
   if(!Number.isFinite(operation.delta))throw Error('Nieprawidłowa długość przycięcia.');
   if(operation.edge==='right'){
    delta=Math.max(MIN_CLIP-(c.sourceOut-c.sourceIn),Math.min(operation.delta,d-c.sourceOut));
    edited={...c,sourceOut:c.sourceOut+delta};at=delta<0?clipEnd(c)+delta:clipEnd(c);until=clipEnd(c);
   }else{
    const trim=Math.max(-c.sourceIn,Math.min(operation.delta,c.sourceOut-c.sourceIn-MIN_CLIP));
    delta=-trim;edited={...c,sourceIn:c.sourceIn+trim};at=c.start;until=c.start+Math.max(0,trim);
   }
  }
  if(Math.abs(delta)<1e-7)active=false;
  const downstream=operation.kind==='delete'?clipEnd(c):operation.edge==='right'?clipEnd(c):until;
  const moved=clips.flatMap(x=>{
   if(x.id===c.id)return edited?[edited]:[];
   const tracks=clipTracks(x),participates=tracks.some(t=>enabled.has(t));
   if(!participates)return [x];
   if(x.start>=downstream-1e-6){
    if(tracks.some(t=>!enabled.has(t))){conflicts.push(`Klip „${clipMedia(p,x)?.name??x.id}”: powiązany obraz i dźwięk mają różne R lub blokadę (${tracks.join(' / ')}).`);return [x];}
    return [{...x,start:x.start+delta}];
   }
   if(clipEnd(x)>at+1e-6&&x.start<until-1e-6&&delta<0)conflicts.push(`Klip „${clipMedia(p,x)?.name??x.id}” przecina usuwany przedział. Przytnij go osobno lub wyłącz jego R.`);
   if(delta>0&&x.start<at-1e-6&&clipEnd(x)>at+1e-6)conflicts.push(`Klip „${clipMedia(p,x)?.name??x.id}” przecina miejsce rozsunięcia.`);
   return [x];
  });
  next=tidy(p,moved);
  if(enabled.has('T'))next=captionRipple(next,at,until,delta);
  // Detached A/V retain the source offset they had before this operation, including deliberate J/L cuts.
  const groups=new Set(clips.map(x=>x.syncGroup).filter(Boolean));
  for(const group of groups){
   const before=clips.filter(x=>x.syncGroup===group),after=moved.filter(x=>x.syncGroup===group);
   const changes=after.map(x=>{const old=before.find(b=>b.id===x.id)!;return x.start-x.sourceIn-(old.start-old.sourceIn);});
   if(changes.length>1&&Math.max(...changes)-Math.min(...changes)>1e-6)conflicts.push('Odłączone audio i obraz przesunęłyby się inaczej. Włącz R na obu torach lub wykonaj edycję bez Ripple.');
   if(after.length<before.length&&after.length>0)conflicts.push('Usunięcie pozostawi część powiązanego obrazu/audio. Usuń je osobno bez Ripple lub anuluj.');
  }
  for(const x of moved){if(x.start< -1e-6||clipEnd(x)>86400+1e-6)conflicts.push('Przesunięcie wychodzi poza zakres osi 00:00–24:00.');
   if(x.kind!=='audio'&&moved.some(o=>o.id!==x.id&&o.kind!=='audio'&&(o.track??0)===(x.track??0)&&x.start<clipEnd(o)-1e-6&&clipEnd(x)>o.start+1e-6))conflicts.push('Przesunięcie spowoduje nakładanie klipów na tej samej ścieżce wideo.');
  }
 }
 if(active&&p.tracks.T?.locked&&JSON.stringify(compositionSegments(p))!==JSON.stringify(compositionSegments(next)))conflicts.push('Zablokowana ścieżka T: napisy źródłowe podążyłyby za zmienianym obrazem. Odblokuj T przed cięciem.');
 if(active){const validated=projectSchema.safeParse(next);if(!validated.success)conflicts.push('Wynik wymaga korekty granic klipów lub napisów. Anuluj i zmniejsz zakres edycji.');}
 const changes:EditChange[]=clips.flatMap(b=>{const a=projectClips(next).find(x=>x.id===b.id);return !a||Math.abs(a.start-b.start)>1e-6||Math.abs(clipEnd(a)-clipEnd(b))>1e-6||a.sourceIn!==b.sourceIn?[{id:b.id,track:clipTracks(b).join('/'),before:b.start,after:a?.start??b.start,oldEnd:clipEnd(b),newEnd:a?clipEnd(a):b.start,removed:!a}]:[];});
 for(const b of p.timelineSegments??[]){const a=next.timelineSegments?.find(s=>s.id===b.id);if(!a||a.start!==b.start||a.end!==b.end)changes.push({id:b.id,track:'T',before:b.start,after:a?.start??b.start,oldEnd:b.end,newEnd:a?.end??b.start,removed:!a,caption:true});}
 return {base:p,next,plain,operation,active,conflicts:[...new Set(conflicts)],changes,delta:active?delta:0,removedTransitions:p.transitions.length-next.transitions.length};
}
