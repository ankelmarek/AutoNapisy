import type {Project} from './model';
import {projectClips} from './editing';
import {libraryItems} from './library';
import {assertUnlockedEdit} from './trackControls';
export function removeUnusedSource(p:Project,id:string):Project{
 const item=libraryItems(p).find(a=>a.id===id);if(!item)throw Error('Nie ma tego źródła.');if(item.uses)throw Error('Źródło jest używane na osi czasu.');
 let next:Project;
 if(id!=='primary')next={...p,assets:p.assets.filter(a=>a.id!==id)};
 else {
  const promoted=p.assets.find(a=>a.kind==='video');
  next={...p,media:promoted?{path:promoted.path,name:promoted.name,duration:promoted.duration}:null,segments:promoted?.segments??[],assets:p.assets.filter(a=>a.id!==promoted?.id),clips:projectClips(p).map(c=>{if(c.assetId!==promoted?.id)return c;const {assetId:_,...rest}=c;return rest;})};
 }
 assertUnlockedEdit(p,next);return next;
}
