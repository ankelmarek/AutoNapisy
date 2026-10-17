import type {Project} from './model';
import {projectClips,type Clip} from './editing';
export type Transform=NonNullable<Clip['transform']>;
export const identity:Transform={scale:1,x:0,y:0};
export const transformOf=(c?:Clip):Transform=>c?.transform??identity;
export function frameRect(width:number,height:number,t:Transform){
 return {left:width*((1-t.scale)/2+t.x),top:height*((1-t.scale)/2+t.y),width:width*t.scale,height:height*t.scale};
}
export function changeTransform(p:Project,id:string,t:Transform):Project{
 const clean={scale:Math.max(.1,Math.min(4,t.scale)),x:Math.max(-2,Math.min(2,t.x)),y:Math.max(-2,Math.min(2,t.y))};
 return {...p,clips:projectClips(p).map(c=>c.id===id?{...c,transform:clean}:c)};
}
export const fillScale=(sourceAspect:number,canvasAspect:number)=>Math.max(sourceAspect/canvasAspect,canvasAspect/sourceAspect);
