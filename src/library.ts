import type {Project} from './model';
import {clipEnd,projectClips,type Clip} from './editing';
export function libraryItems(p:Project){
 const clips=projectClips(p);
 return [...(p.media?[{...p.media,id:'primary',kind:'video' as const}]:[]),...p.assets].map(a=>({...a,uses:clips.filter(c=>(c.assetId??'primary')===a.id).length}));
}
export function insertLibraryItem(p:Project,id:string,at:number):Project{
 const m=libraryItems(p).find(a=>a.id===id);if(!m?.duration||m.duration<.05)throw new Error('Nieznany plik lub czas nagrania');
 const clips=projectClips(p);if(clips.length>=100)throw new Error('Maksymalnie 100 klipów w projekcie');
 let track:0|1=0,start=Math.max(0,at);
 if(m.kind==='video'){
  const free=(lane:number)=>clips.every(c=>c.kind==='audio'||(c.track??0)!==lane||clipEnd(c)<=start||c.start>=start+m.duration!);
  if(!free(0)){if(free(1))track=1;else start=Math.max(0,...clips.filter(c=>c.kind!=='audio'&&(c.track??0)===0).map(clipEnd));}
 }else if(clips.some(c=>(c.track??0)===0&&c.start<=start&&clipEnd(c)>start))track=1;
 if(start+m.duration>86400)throw new Error('Montaż może trwać najwyżej 24 godziny');
 const clip:Clip={id:crypto.randomUUID(),sourceIn:0,sourceOut:m.duration,start,track,kind:m.kind,...(id==='primary'?{}:{assetId:id})};
 return {...p,clips:[...clips,clip]};
}
