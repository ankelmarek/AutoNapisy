import {createElement,type CSSProperties} from 'react';
import icons from './tabler-icons.json';
// Official Tabler Icons v3.35.0, MIT; see licenses/Tabler-Icons-MIT.txt.
// Only static SVG primitives are bundled.
export type IconName=keyof typeof icons;
export default function Icon({name,size=18,style}:{name:IconName;size?:number;style?:CSSProperties}){
 const icon=icons[name];
 return <svg data-icon={`tabler-${icon.name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style}>{icon.parts.map((part,i)=>createElement(part.tag,{...part.attrs,key:i}))}</svg>;
}
