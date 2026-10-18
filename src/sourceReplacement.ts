import {projectSchema,type Project} from './model';
import {libraryItems} from './library';
import {projectClips} from './editing';
import {assertUnlockedEdit,clipLocked} from './trackControls';
export type SourceInfo={duration:number;videoStreams:number;audioStreams:number;width:number;height:number;rotation:number;fps:number|null;audioChannels:number|null;sampleRate:string|null};
export type Replacement={token:number;path:string;name:string;info:SourceInfo;original:SourceInfo|null};
export type ReplacementPolicy={keepCaptions:boolean;sameMaterial:boolean};
export type SourceConflict={message:string;time?:number;clipId?:string};
export function replacementConflicts(p:Project,id:string,r:Replacement,policy:ReplacementPolicy):SourceConflict[]{
 const item=libraryItems(p).find(a=>a.id===id);if(!item)return [{message:'Nie ma już tego źródła w projekcie.'}];
 const conflicts:SourceConflict[]=[],d=r.info.duration;
 if(!Number.isFinite(d)||d<.05||d>86400)conflicts.push({message:'Nieprawidłowy czas zamiennika.'});
 if(item.kind==='video'&&(!r.info.videoStreams||!r.info.width||!r.info.height))conflicts.push({message:'Zamiennik nie zawiera obrazu.'});
 if(item.kind==='audio'&&!r.info.audioStreams)conflicts.push({message:'Zamiennik nie zawiera dźwięku.'});
 for(const c of projectClips(p).filter(c=>(c.assetId??'primary')===id)){
  if(clipLocked(p,c))conflicts.push({message:'Użycie źródła znajduje się na zablokowanej ścieżce.',time:c.start,clipId:c.id});
  if(c.sourceOut>d+1e-6)conflicts.push({message:`Ujęcie wymaga źródła do ${c.sourceOut.toFixed(3)} s; zamiennik ma ${d.toFixed(3)} s.`,time:c.start,clipId:c.id});
  if(c.kind==='audio'&&!r.info.audioStreams)conflicts.push({message:'Odłączony klip audio wymaga strumienia dźwięku.',time:c.start,clipId:c.id});
  for(const env of [c.audio,c.crossfade]){if(!env)continue;
   if(('points'in env&&(env as NonNullable<typeof c.audio>).points.some(a=>a.time>d+1e-6))||(env.fadeIn&&env.fadeIn.anchor+env.fadeIn.duration>d+1e-6)||(env.fadeOut&&env.fadeOut.anchor>d+1e-6))conflicts.push({message:'Zamiennik nie mieści źródłowych punktów głośności lub wyciszeń.',time:c.start,clipId:c.id});
  }
 }
 const segments=id==='primary'?p.segments:p.assets.find(a=>a.id===id)!.segments;
 const used=projectClips(p).some(c=>(c.assetId??'primary')===id);
 if(policy.keepCaptions&&segments.some(s=>s.end>d+1e-6))conflicts.push({message:'Zachowywane napisy wychodzą poza długość nowego źródła.'});
 if(used&&!policy.keepCaptions&&p.tracks.T?.locked&&(segments.length||p.timelineSegments!==null))conflicts.push({message:'Odblokuj ścieżkę napisów przed ich odświeżeniem.'});
 return conflicts;
}
export function replaceSource(p:Project,id:string,r:Replacement,policy:ReplacementPolicy):Project{
 const conflicts=replacementConflicts(p,id,r,policy);if(conflicts.length)throw Error(conflicts.map(c=>c.message).join('\n'));
 // Freeze legacy implicit full-length clip before changing the library duration.
 const clips=projectClips(p);
 const patch={path:r.path,name:r.name,duration:r.info.duration};
 const clear=!policy.keepCaptions;
 const targetIds=new Set(clips.filter(c=>(c.assetId??'primary')===id).map(c=>c.id));
 const clearTimeline=clear&&targetIds.size>0&&p.timelineSegments!==null;
 const edits=Object.fromEntries(Object.entries(p.captionEdits).filter(([key])=>{
  if(key.startsWith('timeline:'))return !clearTimeline;
  try{const value:unknown=JSON.parse(key);return !Array.isArray(value)||!targetIds.has(value[0]);}catch{return true;}
 }));
 const next:Project={...p,clips,
  media:id==='primary'?{...p.media!,...patch}:p.media,
  assets:p.assets.map(a=>a.id===id?{...a,...patch,segments:policy.keepCaptions?a.segments:[],...(!policy.sameMaterial?{provenance:undefined}:{})}:a),
  segments:id==='primary'&&!policy.keepCaptions?[]:p.segments,
  timelineSegments:clearTimeline?null:p.timelineSegments,
  captionEdits:clear?edits:p.captionEdits,
 };
 assertUnlockedEdit(p,next);return projectSchema.parse(next);
}
export function replacementWarnings(r:Replacement):string[]{
 const before=r.original,after=r.info,result:string[]=[];
 if(!before)result.push('Nie można porównać parametrów poprzedniego źródła. Sprawdź obraz, dźwięk i synchronizację po podmianie.');
 else {
  if(before.width!==after.width||before.height!==after.height||before.rotation!==after.rotation)result.push('Zmieniły się wymiary lub obrót. Zachowane kadrowanie może wymagać korekty.');
  if(before.fps!==after.fps)result.push('Zmienił się FPS. Sprawdź trafność cięć i synchronizację.');
  if(before.audioStreams!==after.audioStreams||before.audioChannels!==after.audioChannels||before.sampleRate!==after.sampleRate)result.push('Zmieniły się parametry dźwięku. Sprawdź miks.');
 }
 if(!after.audioStreams)result.push('Nowy film nie ma dźwięku. Jego połączony pasek audio będzie niemy.');
 return result;
}
