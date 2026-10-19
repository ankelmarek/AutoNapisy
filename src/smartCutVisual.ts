import {projectSchema} from './model';
import {clipEnd,compositionSegments,editDuration,projectClips,type Clip} from './editing';
import {assertUnlockedEdit} from './trackControls';
import {tracksOf,trackId} from './trackModel';
import {addTrack} from './tracks';
import {libraryItems} from './library';
import {cutChanges,frameTime,type CutPlan,type SmartCutRequest} from './smartCut';

export type VisualAnalysis={key:string;before:{time:number;png:string};after:{time:number;png:string};verdict:'jump'|'motion'|'quiet'|'limited';message:string;detail:string};
export type CutCover={sourceId:string;sourceIn:number;duration:number};
/** Shift a candidate, never the saved project. Source and lock checks remain in the cut planner. */
export function nudgeCut(r:SmartCutRequest,frames:number):SmartCutRequest{
 const delta=frames/30;
 return r.kind==='range'?{...r,from:frameTime(r.from+delta),to:frameTime(r.to+delta)}:{...r,at:frameTime(r.at+delta)};
}
/** Explicit, silent picture overlay. No source transcript is replaced by the cover's transcript. */
export function coverSmartCut(plan:CutPlan,cover:CutCover,token:string):CutPlan{
 const conflicts=[...plan.conflicts],notes=[...plan.notes];let next=plan.next;
 try{
  if(plan.conflicts.length)return plan;
  const source=libraryItems(next).find(m=>m.id===cover.sourceId&&m.kind==='video');
  if(!source?.duration)throw Error('Wybierz film z biblioteki projektu.');
  if(!projectClips(next).some(c=>c.kind!=='audio'&&(c.track??0)===plan.track&&Math.abs(clipEnd(c)-plan.join)<1e-6)||!projectClips(next).some(c=>c.kind!=='audio'&&(c.track??0)===plan.track&&Math.abs(c.start-plan.join)<1e-6))throw Error('Przebitka wymaga styku dwóch fragmentów. Włącz Ripple lub wybierz połączenie.');
  const duration=frameTime(cover.duration),sourceIn=frameTime(cover.sourceIn),total=editDuration(next);
  if(!Number.isFinite(duration)||duration<.2-1e-6||duration>4||!Number.isFinite(sourceIn)||sourceIn<0||sourceIn+duration>source.duration+1e-6)throw Error('Przebitka musi mieć 0,2–4 s i mieścić się w źródle.');
  const join=frameTime(plan.join),start=frameTime(Math.max(0,Math.min(join-duration/2,total-duration))),end=start+duration;
  if(start<0||join-start<1/30-1e-6||end-join<1/30-1e-6||end>total+1e-6)throw Error('Przebitka wymaga obrazu po obu stronach cięcia.');
  const clips=projectClips(next),top=tracksOf(next,'video').at(-1)!;
  let track=top;
  const selected=clips.find(c=>c.kind!=='audio'&&(c.track??0)===plan.track&&Math.abs(clipEnd(c)-join)<1/30+1e-6);
  // Reuse only a clear, visible top lane above the cut; never reorder or unlock an existing lane.
  if(top.index===(selected?.track??plan.track)||next.tracks[top.id]?.locked||next.tracks[top.id]?.hidden||clips.some(c=>c.kind!=='audio'&&(c.track??0)===top.index&&c.start<end-1e-6&&clipEnd(c)>start+1e-6)){
   next=addTrack(next,'video');track=tracksOf(next,'video').at(-1)!;
  }
  const id=`sc:${token}:cover`;
  if(clips.some(c=>c.id===id))throw Error('Konflikt identyfikatora przebitki. Otwórz SmartCut ponownie.');
  const clip:Clip={id,kind:'video',track:track.index,start,sourceIn,sourceOut:sourceIn+duration,volume:0,audioRoute:'embedded',...(source.id==='primary'?{}:{assetId:source.id})};
  next={...next,clips:[...clips,clip]};
  if(!plan.next.timelineSegments&&JSON.stringify(compositionSegments(next))!==JSON.stringify(compositionSegments(plan.next))){
   if(plan.next.tracks.T?.locked)throw Error('Odblokuj T, aby zachować napisy pod przebitką.');
   next={...next,timelineSegments:compositionSegments(plan.next).map(({sourceId:_,clipId:__,assetId:___,...s})=>s),captionEdits:{}};
   notes.push('Zachowano widoczne napisy wypowiedzi jako napisy montażu T; tekst przebitki nie zastępuje wypowiedzi.');
  }
  assertUnlockedEdit(plan.base,next);projectSchema.parse(next);
  notes.push(`Przebitka na ${trackId('video',track.index)}: ${duration.toFixed(3)} s wokół cięcia. Dźwięk przebitki jest wyłączony; miks wypowiedzi pozostaje bez zmian.`);
 }catch(e){conflicts.push(e instanceof Error?e.message:String(e));next=plan.next;}
 return {...plan,next,notes,conflicts:[...new Set(conflicts)],changes:cutChanges(plan.base,next)};
}
