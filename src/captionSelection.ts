import type {CaptionStyle} from './captions';

/** Session-only selection; IDs are always ordered by the displayed montage. */
export function pruneCaptionSelection(ids:readonly string[],order:readonly string[]):string[]{
 const wanted=new Set(ids);return order.filter(id=>wanted.has(id));
}
export function selectCaptions(ids:readonly string[],anchor:string,id:string,order:readonly string[],modifiers:{ctrlKey?:boolean;metaKey?:boolean;shiftKey?:boolean}={}):{ids:string[];anchor:string}{
 if(!order.includes(id))return {ids:pruneCaptionSelection(ids,order),anchor:order.includes(anchor)?anchor:''};
 if(modifiers.shiftKey&&order.includes(anchor)){
  const a=order.indexOf(anchor),b=order.indexOf(id),range=order.slice(Math.min(a,b),Math.max(a,b)+1);
  return {ids:pruneCaptionSelection(modifiers.ctrlKey||modifiers.metaKey?[...ids,...range]:range,order),anchor};
 }
 const next=modifiers.ctrlKey||modifiers.metaKey?(ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]):[id];
 return {ids:pruneCaptionSelection(next,order),anchor:id};
}
/** Compare effective configurations, not generated style IDs or object key order. */
export function mixedCaptionStyles(styles:readonly CaptionStyle[]):boolean{
 const stable=(v:unknown):string=>v&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(Object.fromEntries(Object.entries(v).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,JSON.parse(stable(v))]))):JSON.stringify(v)??'null';
 if(styles.length<2)return false;const first=stable(styles[0]);return styles.slice(1).some(s=>stable(s)!==first);
}
