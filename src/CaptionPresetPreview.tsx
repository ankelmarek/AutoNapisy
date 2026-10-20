import {useEffect,useRef,useState} from 'react';
import type {CaptionCard,CaptionStyle} from './captions';
import {createCaptionLayerRenderer} from './captionLayer';
import {hasCaptionMotion} from './captionAnimation';

// Gallery example only, never inserted into a project's transcription.
const demo:CaptionCard={id:'gallery-demo',text:'Twoja historia ma znaczenie',start:0,end:3.2,styleId:'demo',words:[{text:'Twoja',start:.15,end:.7},{text:'historia',start:.8,end:1.4},{text:'ma',start:1.5,end:1.95},{text:'znaczenie',start:2.05,end:2.9}]};
export default function CaptionPresetPreview({style,active,label,height=202}:{style:CaptionStyle;active:boolean;label?:string;height?:number}){
 const canvas=useRef<HTMLCanvasElement>(null),[ready,setReady]=useState(0);
 useEffect(()=>{let alive=true;void document.fonts.load(`24px "${style.fontFamily}"`).catch(()=>[]).then(()=>{if(alive)setReady(n=>n+1);});return()=>{alive=false;};},[style.fontFamily]);
 useEffect(()=>{if(!canvas.current)return;const draw=createCaptionLayerRenderer(canvas.current),centered={...style,position:'center' as const,marginPercent:4,boxWidth:90};let frame=0,last=-1;const start=performance.now();
  const render=(time:number)=>{const f=Math.floor(time*30);if(f!==last){last=f;draw(demo,centered,time);if(canvas.current)canvas.current.dataset.previewFrame=String(f);}};
  if(active&&hasCaptionMotion(style)){const tick=(now:number)=>{render((now-start)/1000%3.2);frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);}else render(1.1);
  return()=>cancelAnimationFrame(frame);
 },[style,active,ready,height]);
 return <canvas ref={canvas} width={360} height={height} aria-hidden={label?undefined:true} aria-label={label} data-demo-active={active&&hasCaptionMotion(style)}/>;
}
