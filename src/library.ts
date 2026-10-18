import type {Project} from './model';
import {tracksOf,hasTrack} from './trackModel';
import {sourceRange,type SourceRange} from './sourceSelection';
import {clipEnd,moveClip,projectClips,type Clip} from './editing';
export function libraryItems(p:Project){
 const clips=projectClips(p);
 return [...(p.media?[{...p.media,id:'primary',kind:'video' as const}]:[]),...p.assets].map(a=>({...a,uses:clips.filter(c=>(c.assetId??'primary')===a.id).length}));
}
export function insertLibraryItem(p:Project,id:string,at:number,requestedTrack?:number,range?:SourceRange,targetKind?:'video'|'audio'):Project{
 const m=libraryItems(p).find(a=>a.id===id);if(!m?.duration||m.duration<.05)throw new Error('Nieznany plik lub czas nagrania');
 if(targetKind&&m.kind!==targetKind)throw Error(m.kind==='audio'?'Upuść plik audio na ścieżkę A.':'Upuść film na ścieżkę V.');
 const chosenRange=sourceRange(m.duration,range),length=chosenRange.sourceOut-chosenRange.sourceIn;
 const clips=projectClips(p);
 if(id!=='primary'&&m.kind==='video'&&!clips.some(c=>c.kind!=='audio')){
   const chosen=p.assets.find(a=>a.id===id)!;const previousId=crypto.randomUUID();
   const promoted:Project={...p,media:{path:chosen.path,name:chosen.name,duration:chosen.duration},segments:chosen.segments,
    assets:[...p.assets.filter(a=>a.id!==id),...(p.media&&p.media.duration!=null?[{...p.media,duration:p.media.duration,id:previousId,kind:'video' as const,segments:p.segments}]:[])],
    clips:clips.map(c=>!c.assetId?{...c,assetId:previousId}:c)};
   return insertLibraryItem(promoted,'primary',at,requestedTrack,chosenRange);
 }
 if(clips.length>=100)throw new Error('Maksymalnie 100 klipów w projekcie');
 if(!Number.isFinite(at))throw Error('Nieprawidłowa pozycja na osi czasu');
 const available=tracksOf(p,m.kind);if(requestedTrack!==undefined&&!hasTrack(p,m.kind,requestedTrack))throw Error('Nie ma wskazanej ścieżki.');
 let track:number=requestedTrack??available[0].index,start=Math.max(0,at);
 if(m.kind==='video'){
  const free=(lane:number)=>clips.every(c=>c.kind==='audio'||(c.track??0)!==lane||clipEnd(c)<=start||c.start>=start+length);
  if(requestedTrack!==undefined){const next=moveClip([...clips,{id:'drop',sourceIn:chosenRange.sourceIn,sourceOut:chosenRange.sourceOut,start,track}], 'drop',start,.3).find(c=>c.id==='drop')!;start=next.start;}else if(!free(track)){const next=available.find(t=>free(t.index));if(next)track=next.index;else start=Math.max(0,...clips.filter(c=>c.kind!=='audio'&&(c.track??0)===track).map(clipEnd));}
 }else if(requestedTrack===undefined&&clips.some(c=>(c.track??0)===track&&c.start<=start&&clipEnd(c)>start))track=available[1]?.index??track;
 if(start+length>86400)throw new Error('Montaż może trwać najwyżej 24 godziny');
 const clip:Clip={id:crypto.randomUUID(),sourceIn:chosenRange.sourceIn,sourceOut:chosenRange.sourceOut,start,track,kind:m.kind,...(m.kind==='video'?{audioRoute:track<2?`A${track+1}`:'embedded'}:{}),...(id==='primary'?{}:{assetId:id})};
 return {...p,clips:[...clips,clip]};
}
export function registerMedia(p:Project,media:{path:string;name:string;duration:number;provenance?:Project['assets'][number]['provenance']},kind:'video'|'audio'):Project{
 if(libraryItems(p).some(m=>m.path===media.path))return p;
 if(libraryItems(p).length>=100)throw Error('Maksymalnie 100 plików w bibliotece');
 const clips=projectClips(p);
 return !p.media&&kind==='video'?{...p,media,clips}:{...p,clips,assets:[...p.assets,{...media,id:crypto.randomUUID(),kind,segments:[]}]};
}
