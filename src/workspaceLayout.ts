export type WorkspaceLayout={left:number;right:number;timeline:number};
export type SplitAxis='left'|'right'|'timeline';
export const defaultLayout:WorkspaceLayout={left:.31,right:.31,timeline:360};
export const layoutStorageKey='rolvixa.workspace.v1';
export function parseLayout(raw:string|null):WorkspaceLayout{
 try{const v=JSON.parse(raw??'null');if(v?.version!==1)return {...defaultLayout};
  const n=(key:SplitAxis,min:number,max:number)=>typeof v[key]==='number'&&Number.isFinite(v[key])?Math.max(min,Math.min(max,v[key])):defaultLayout[key];
  return {left:n('left',.1,.5),right:n('right',.1,.5),timeline:n('timeline',220,900)};
 }catch{return {...defaultLayout};}
}
export function fitLayout(value:WorkspaceLayout,width:number,height:number){
 const usable=Math.max(800,width)-20;
 const left=Math.max(240,Math.min(usable*.5,usable-280-260,value.left*usable));
 const right=Math.max(260,Math.min(usable*.5,usable-left-280,value.right*usable));
 const timeline=Math.max(220,Math.min(Math.max(220,height-260),value.timeline));
 return {left,right,timeline,usable};
}
export function moveSplitter(value:WorkspaceLayout,axis:SplitAxis,delta:number,width:number,height:number):WorkspaceLayout{
 const fit=fitLayout(value,width,height);
 const next={...value};
 if(axis==='timeline')next.timeline=fit.timeline-delta;
 else next[axis]=(fit[axis]+(axis==='left'?delta:-delta))/fit.usable;
 const bounded=fitLayout(next,width,height);
 return {left:bounded.left/fit.usable,right:bounded.right/fit.usable,timeline:bounded.timeline};
}
