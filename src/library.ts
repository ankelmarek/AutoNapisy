import type {Project} from './model';
import {clipEnd,moveClip,projectClips,type Clip} from './editing';
export function libraryItems(p:Project){
 const clips=projectClips(p);
 return [...(p.media?[{...p.media,id:'primary',kind:'video' as const}]:[]),...p.assets].map(a=>({...a,uses:clips.filter(c=>(c.assetId??'primary')===a.id).length}));
}
export function insertLibraryItem(p:Project,id:string,at:number,requestedTrack?:0|1):Project{
 const m=libraryItems(p).find(a=>a.id===id);if(!m?.duration||m.duration<.05)throw new Error('Nieznany plik lub czas nagrania');
 const clips=projectClips(p);
 if(id!=='primary'&&m.kind==='video'&&!clips.some(c=>c.kind!=='audio')){
   const chosen=p.assets.find(a=>a.id===id)!;const previousId=crypto.randomUUID();
   const promoted:Project={...p,media:{path:chosen.path,name:chosen.name,duration:chosen.duration},segments:chosen.segments,
    assets:[...p.assets.filter(a=>a.id!==id),...(p.media&&p.media.duration!=null?[{...p.media,duration:p.media.duration,id:previousId,kind:'video' as const,segments:p.segments}]:[])],
    clips:clips.map(c=>!c.assetId?{...c,assetId:previousId}:c)};
   return insertLibraryItem(promoted,'primary',at,requestedTrack);
 }
 if(clips.length>=100)throw new Error('Maksymalnie 100 klipów w projekcie');
 let track:0|1=requestedTrack??0,start=Math.max(0,at);
 if(m.kind==='video'){
  const free=(lane:number)=>clips.every(c=>c.kind==='audio'||(c.track??0)!==lane||clipEnd(c)<=start||c.start>=start+m.duration!);
  if(requestedTrack!==undefined){const next=moveClip([...clips,{id:'drop',sourceIn:0,sourceOut:m.duration,start,track}], 'drop',start,.3).find(c=>c.id==='drop')!;start=next.start;}else if(!free(0)){if(free(1))track=1;else start=Math.max(0,...clips.filter(c=>c.kind!=='audio'&&(c.track??0)===0).map(clipEnd));}
 }else if(requestedTrack===undefined&&clips.some(c=>(c.track??0)===0&&c.start<=start&&clipEnd(c)>start))track=1;
 if(start+m.duration>86400)throw new Error('Montaż może trwać najwyżej 24 godziny');
 const clip:Clip={id:crypto.randomUUID(),sourceIn:0,sourceOut:m.duration,start,track,kind:m.kind,...(id==='primary'?{}:{assetId:id})};
 return {...p,clips:[...clips,clip]};
}
export function registerMedia(p:Project,media:{path:string;name:string;duration:number},kind:'video'|'audio'):Project{
 if(libraryItems(p).length>=100)throw Error('Maksymalnie 100 plików w bibliotece');
 if(libraryItems(p).some(m=>m.path===media.path))return p;
 const clips=projectClips(p);
 return !p.media&&kind==='video'?{...p,media,clips}:{...p,clips,assets:[...p.assets,{...media,id:crypto.randomUUID(),kind,segments:[]}]};
}
