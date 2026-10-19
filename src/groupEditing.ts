import type {Project} from './model';
import {clipEnd,lane,projectClips,type Clip} from './editing';
import {assertUnlockedEdit,clipLocked} from './trackControls';
/** Moving a linked picture also moves its detached sound, exactly once. */
export function movingIds(p:Project,ids:readonly string[]):Set<string>{
 const clips=projectClips(p),selected=new Set(ids),groups=new Set(clips.filter(c=>selected.has(c.id)&&c.kind!=='audio'&&c.audioDetached&&c.syncGroup).map(c=>c.syncGroup));
 return new Set(clips.filter(c=>selected.has(c.id)||(c.kind==='audio'&&groups.has(c.syncGroup))).map(c=>c.id));
}
export function moveGroup(p:Project,ids:readonly string[],delta:number,snapSeconds=0):Clip[]{
 if(!Number.isFinite(delta))throw Error('Nieprawidłowe przesunięcie grupy.');
 const clips=projectClips(p),moving=movingIds(p,ids),members=clips.filter(c=>moving.has(c.id));if(!members.length)return clips;
 if(members.some(c=>clipLocked(p,c)))throw Error('Odblokuj wszystkie ścieżki zaznaczonej grupy i powiązanego audio.');
 const low=-Math.min(...members.map(c=>c.start)),high=86400-Math.max(...members.map(clipEnd));
 const valid=(d:number)=>d>=low-1e-7&&d<=high+1e-7&&members.every(c=>c.kind==='audio'||clips.every(o=>moving.has(o.id)||lane(c)!==lane(o)||c.start+d>=clipEnd(o)-1e-7||clipEnd(c)+d<=o.start+1e-7));
 delta=Math.max(low,Math.min(high,delta));
 if(snapSeconds>0){const magnets=[low,...members.flatMap(c=>clips.filter(o=>!moving.has(o.id)).flatMap(o=>[o.start-c.start,clipEnd(o)-c.start,o.start-clipEnd(c),clipEnd(o)-clipEnd(c)]))].filter(d=>Math.abs(d-delta)<=snapSeconds&&valid(d));if(magnets.length)delta=magnets.sort((a,b)=>Math.abs(a-delta)-Math.abs(b-delta))[0];}
 if(!valid(delta))throw Error('Grupa nachodzi na inny film. Zmień pozycję lub zaznaczenie.');
 const next=clips.map(c=>moving.has(c.id)?{...c,start:Math.max(0,c.start+delta)}:c);
 assertUnlockedEdit(p,{...p,clips:next});return next;
}
