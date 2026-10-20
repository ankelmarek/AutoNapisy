import {layoutCaption,drawStaticCaption} from './captionCanvas';
import type {CaptionCard,CaptionStyle} from './captions';
import {captionMotion,captionEase} from './captionAnimation';

/** Shared 720px geometry, real word clock and deterministic Canvas effects for every output. */
export function createAnimatedCaptionRenderer(canvas:HTMLCanvasElement){
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Brak obsługi Canvas');
 let cached:{key:string;box:ReturnType<typeof layoutCaption>}|null=null;
 return (card:CaptionCard|null,style:CaptionStyle|null,time:number)=>{
  const {width:pw,height:ph}=canvas;ctx.resetTransform();ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.clearRect(0,0,pw,ph);
  if(!card||!style)return {fallback:false,active:-1};
  if(style.animation?.enabled===false){drawStaticCaption(canvas,card.text,style);return {fallback:false,active:-1};}
  const width=720,height=ph/pw*720,ratio=pw/720,motion=captionMotion(card,style,time),a=style.animation,preset=a?.preset,intensity=a?.intensity??1,speed=a?.speed??1,t=motion.time;
  ctx.scale(ratio,ratio);let text=card.text,offset=0,groupStart=card.start;
  if(preset==='impact'&&!motion.fallback&&card.words?.length){
   let last=-1;for(let i=0;i<card.words.length;i++)if(card.words[i].start<=t)last=i;offset=Math.floor(Math.max(0,last)/3)*3;const group=card.words.slice(offset,offset+3);text=group.map(w=>w.text).join(' ');groupStart=group[0].start;
  }
  const key=JSON.stringify([text,style,height]);if(cached?.key!==key)cached={key,box:layoutCaption(text,style,width,height)};
  const box=cached.box,x=(width-box.boxWidth)/2,y=style.position==='top'?height*style.marginPercent/100:style.position==='center'?(height-box.boxHeight)/2:height*(1-style.marginPercent/100)-box.boxHeight;
  const intro=captionEase((t-card.start)/Math.max(.12,Math.min(preset==='editorial'?.24:.48,.24/speed)));
  ctx.save();ctx.globalAlpha=motion.opacity;
  if(!motion.fallback&&preset==='editorial'){ctx.globalAlpha=1-intensity+intensity*intro;ctx.translate(0,8*(1-intro)*intensity);}
  if(!motion.fallback&&preset==='slide-reveal'){
   const reveal=1-intensity+intensity*intro;ctx.beginPath();ctx.rect(x-12,y+box.boxHeight*(1-reveal),box.boxWidth+24,box.boxHeight*reveal+12);ctx.clip();ctx.translate(0,18*(1-intro)*intensity);
  }
  if(!motion.fallback&&preset==='impact'){
   const enter=captionEase((t-groupStart)/Math.max(.1,Math.min(.22,.16/speed))),scale=1-.14*(1-enter)*intensity;
   ctx.translate(width/2,y+box.boxHeight/2);ctx.scale(scale,scale);ctx.translate(-width/2,-y-box.boxHeight/2);
  }
  ctx.font=`${box.fontSize}px "${style.fontFamily}"`;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fontKerning='normal';ctx.lineJoin='round';
  const metrics=ctx.measureText('Mg'),ascent=metrics.fontBoundingBoxAscent??box.fontSize*.8,descent=metrics.fontBoundingBoxDescent??box.fontSize*.2,lh=box.fontSize*1.04,baseline=y+box.paddingY+(lh-ascent-descent)/2+ascent;
  const started=card.words?.some(w=>w.start<=t)??false;
  if(style.effect!=='outline'&&(preset!=='type-flow'||motion.fallback||started)){
   ctx.fillStyle=style.background;ctx.beginPath();ctx.roundRect(x,y,box.boxWidth,box.boxHeight,Math.max(0,Math.min(box.borderRadius,box.boxWidth/2,box.boxHeight/2)));ctx.fill();
  }
  if(preset==='editorial'){ctx.fillStyle=a!.accentColor;ctx.fillRect(x+box.paddingX,y+box.paddingY-6,Math.min(40,box.boxWidth),2);}
  let index=offset;
  for(const [lineIndex,line] of box.lines.entries()){
   const left=(width-ctx.measureText(line).width)/2;
   for(const match of line.matchAll(/\S+/g)){
    const word=match[0],prefix=line.slice(0,match.index),wx=left+ctx.measureText(prefix).width,wy=baseline+lineIndex*lh,ww=ctx.measureText(word).width,active=index===motion.active,w=card.words?.[index];
    ctx.save();
    if(!motion.fallback&&preset==='type-flow'){
     if(!w||t<w.start){ctx.restore();index++;continue;}
     ctx.globalAlpha*=1-intensity+intensity*captionEase((t-w.start)/Math.max(.06,.1/speed));
    }
    if(active&&preset==='pop-beat'){ctx.translate(wx+ww/2,wy-ascent/2);ctx.scale(motion.scale,motion.scale);ctx.translate(-(wx+ww/2),-(wy-ascent/2));}
    if(active&&preset==='marker'&&w){ctx.fillStyle=a!.accentColor;ctx.fillRect(wx-3,wy-ascent*.24,(ww+6)*Math.min(1,Math.max(0,(t-w.start)/(w.end-w.start)))**(1/speed),box.fontSize*.34*intensity);}
    if(active&&preset==='neon'){
     const pulse=.75+.25*Math.sin((t-card.start)*Math.PI*2*.7*speed);ctx.shadowColor=a!.accentColor;ctx.shadowBlur=(8+12*pulse)*intensity*ratio;
    }
    const stroke=style.outlineWidth??(style.effect==='outline'?3:0);
    if(stroke>0){ctx.strokeStyle=style.outlineColor??'#080808';ctx.lineWidth=stroke;ctx.strokeText(word,wx,wy);}
    ctx.fillStyle=active&&a&&['karaoke-flow','pop-beat','impact','type-flow'].includes(preset!)?a.accentColor:style.color;
    if(active&&preset==='neon'){const gradient=ctx.createLinearGradient(wx,wy,wx+ww,wy);gradient.addColorStop(0,'#4de6ff');gradient.addColorStop(1,a!.accentColor);ctx.fillStyle=gradient;}
    if(active&&preset==='karaoke-flow'&&a){const mix=(i:number)=>Math.round(parseInt(style.color.slice(i,i+2),16)*(1-intensity)+parseInt(a.accentColor.slice(i,i+2),16)*intensity).toString(16).padStart(2,'0');ctx.fillStyle='#'+mix(1)+mix(3)+mix(5);}
    ctx.fillText(word,wx,wy);ctx.restore();index++;
   }
  }
  ctx.restore();ctx.globalAlpha=1;ctx.shadowBlur=0;return motion;
 };
}
