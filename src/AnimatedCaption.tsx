import {useEffect,useRef,useState} from 'react';
import type {CaptionCard,CaptionStyle} from './captions';
import {createAnimatedCaptionRenderer} from './animatedCaptionCanvas';
export default function AnimatedCaption({card,style,width,height,time}:{card:CaptionCard;style:CaptionStyle;width:number;height:number;time:number}){
 const canvas=useRef<HTMLCanvasElement>(null),renderer=useRef<ReturnType<typeof createAnimatedCaptionRenderer>|null>(null),[fonts,setFonts]=useState(0);
 useEffect(()=>{let alive=true;void document.fonts.load(`24px "${style.fontFamily}"`).then(()=>{if(alive){renderer.current=null;setFonts(n=>n+1);}});return()=>{alive=false;};},[style.fontFamily]);
 useEffect(()=>{if(canvas.current){renderer.current??=createAnimatedCaptionRenderer(canvas.current);const state=renderer.current(card,style,time);canvas.current.dataset.fallback=String(state.fallback);canvas.current.dataset.activeWord=String(state.active);}},[card,style,time,width,height,fonts]);
 return <canvas ref={canvas} width={Math.max(1,Math.round(width))} height={Math.max(1,Math.round(height))} className="animated-caption-canvas" aria-label={card.text} style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}/>;
}
