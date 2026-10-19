import {layoutCaption} from './captionCanvas';
import type {CaptionCard,CaptionStyle} from './captions';
import {captionMotion} from './captionAnimation';

/** One canvas, one layout cache, no wall clock. Shared by preview and streamed export. */
export function createAnimatedCaptionRenderer(canvas:HTMLCanvasElement){
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Brak obsługi Canvas');
 let cached:{key:string;box:ReturnType<typeof layoutCaption>}|null=null;
 return (card:CaptionCard|null,style:CaptionStyle|null,time:number)=>{
  const {width,height}=canvas;ctx.resetTransform();ctx.globalAlpha=1;ctx.clearRect(0,0,width,height);
  if(!card||!style)return {fallback:false,active:-1};
  const key=JSON.stringify([card.text,style,width,height]);if(cached?.key!==key)cached={key,box:layoutCaption(card.text,style,width,height)};
  const box=cached.box,motion=captionMotion(card,style,time),a=style.animation;
  const x=(width-box.boxWidth)/2,y=style.position==='top'?height*style.marginPercent/100:style.position==='center'?(height-box.boxHeight)/2:height*(1-style.marginPercent/100)-box.boxHeight;
  ctx.globalAlpha=motion.opacity;ctx.font=`${box.fontSize}px "${style.fontFamily}"`;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fontKerning='normal';ctx.lineJoin='round';
  const metrics=ctx.measureText('Mg'),ascent=metrics.fontBoundingBoxAscent??box.fontSize*.8,descent=metrics.fontBoundingBoxDescent??box.fontSize*.2,lh=box.fontSize*1.04,baseline=y+box.paddingY+(lh-ascent-descent)/2+ascent;
  if(style.effect!=='outline'){
   ctx.fillStyle=style.background;ctx.beginPath();ctx.roundRect(x,y,box.boxWidth,box.boxHeight,Math.max(0,Math.min(box.borderRadius,box.boxWidth/2,box.boxHeight/2)));ctx.fill();
  }
  let index=0;
  for(const [lineIndex,line] of box.lines.entries()){
   const left=(width-ctx.measureText(line).width)/2,words=line.split(' ');let prefix='';
   for(const word of words){
    const wx=left+ctx.measureText(prefix).width,wy=baseline+lineIndex*lh,ww=ctx.measureText(word).width,active=index===motion.active;
    ctx.save();if(active&&a?.preset==='pop-beat'){ctx.translate(wx+ww/2,wy-ascent/2);ctx.scale(motion.scale,motion.scale);ctx.translate(-(wx+ww/2),-(wy-ascent/2));}
    const stroke=(style.outlineWidth??(style.effect==='outline'?3:0))*width/720;
    if(stroke>0){ctx.strokeStyle=style.outlineColor??'#080808';ctx.lineWidth=stroke;ctx.strokeText(word,wx,wy);}
    ctx.fillStyle=active&&a?a.accentColor:style.color;ctx.fillText(word,wx,wy);ctx.restore();prefix+=word+' ';index++;
   }
  }
  ctx.globalAlpha=1;return motion;
 };
}
