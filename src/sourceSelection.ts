import {newProject,type Project} from './model';
export type SourceRange={sourceIn:number;sourceOut:number};
export type SourceItem={id:string;path:string;name:string;duration:number|null;kind:'video'|'audio'};
export function sourceRange(duration:number,range?:SourceRange):SourceRange {
 const r=range??{sourceIn:0,sourceOut:duration};
 if(!Number.isFinite(duration)||duration<.05||duration>86400||!Number.isFinite(r.sourceIn)||!Number.isFinite(r.sourceOut)||r.sourceIn<0||r.sourceOut>duration+1e-7||r.sourceOut-r.sourceIn<.05-1e-7)throw Error('Nieprawidłowy zakres źródła (minimum 0,05 s)');
 return {...r,sourceOut:Math.min(duration,r.sourceOut)};
}
export function markRange(range:SourceRange,edge:'in'|'out',time:number,duration:number):SourceRange{
 if(!Number.isFinite(time))return range;
 const frame=Math.round(time*30)/30;
 return edge==='in'?{...range,sourceIn:Math.max(0,Math.min(range.sourceOut-.05,frame))}:{...range,sourceOut:Math.min(duration,Math.max(range.sourceIn+.05,frame))};
}
export function sourceProject(item:SourceItem):Project {
 const p=newProject(),duration=item.duration??0;sourceRange(duration);
 const m={path:item.path,name:item.name,duration};
 return {...p,name:item.name,media:item.kind==='video'?m:null,assets:item.kind==='audio'?[{...m,id:'source-audio',kind:'audio',segments:[]}]:[],clips:[{id:'source-viewer',kind:item.kind,sourceIn:0,sourceOut:duration,start:0,...(item.kind==='audio'?{assetId:'source-audio'}:{})}]};
}
export const SOURCE_RANGE_TYPE='application/x-rolvixa-range';
export function decodeSourceDrop(raw:string):{id:string;range:SourceRange}{
 const v:unknown=JSON.parse(raw);if(!v||typeof v!=='object')throw Error('Nieprawidłowy fragment');
 const r=v as Record<string,unknown>;
 if(typeof r.id!=='string'||!r.id||typeof r.sourceIn!=='number'||typeof r.sourceOut!=='number')throw Error('Nieprawidłowy fragment');
 return {id:r.id,range:{sourceIn:r.sourceIn,sourceOut:r.sourceOut}};
}
