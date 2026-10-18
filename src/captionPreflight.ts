import type {Project} from './model';
import {compositionProject} from './editing';
import {captionExport} from './captions';
import {layoutCaption} from './captionCanvas';
import type {Margins} from './SafeZones';
import type {PreflightIssue} from './preflight';
export type CaptionBounds={left:number;top:number;right:number;bottom:number};
/** Uses the same wrapping, font metrics and baseline as the actual PNG renderer. */
export function captionBounds(text:string,style:Project['styles'][string],width:number,height:number):CaptionBounds{
 const box=layoutCaption(text,style,width,height),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw Error('Nie można zmierzyć napisów');
 ctx.font=`${box.fontSize}px "${style.fontFamily}"`;ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fontKerning='normal';
 const x=(width-box.boxWidth)/2,y=style.position==='top'?height*style.marginPercent/100:style.position==='center'?(height-box.boxHeight)/2:height*(1-style.marginPercent/100)-box.boxHeight;
 const metrics=ctx.measureText('Mg'),ascent=metrics.fontBoundingBoxAscent??box.fontSize*.8,descent=metrics.fontBoundingBoxDescent??box.fontSize*.2,lineHeight=box.fontSize*1.04,baseline=y+box.paddingY+(lineHeight-ascent-descent)/2+ascent;
 const result=style.effect==='outline'?{left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity}:{left:x,right:x+box.boxWidth,top:y,bottom:y+box.boxHeight};
 const stroke=(style.outlineWidth??(style.effect==='outline'?3:0))*width/720/2;
 box.lines.forEach((line,i)=>{const m=ctx.measureText(line);result.left=Math.min(result.left,width/2-(m.actualBoundingBoxLeft??m.width/2)-stroke);result.right=Math.max(result.right,width/2+(m.actualBoundingBoxRight??m.width/2)+stroke);result.top=Math.min(result.top,baseline+i*lineHeight-(m.actualBoundingBoxAscent??ascent)-stroke);result.bottom=Math.max(result.bottom,baseline+i*lineHeight+(m.actualBoundingBoxDescent??descent)+stroke);});
 return result;
}
export function captionPreflight(p:Project,width:number,height:number,margins:Margins|null):PreflightIssue[]{
 if(!width||!height)return[];const snapshot=captionExport(compositionProject(p)),out:PreflightIssue[]=[],cache=new Map<string,CaptionBounds>();
 for(const s of snapshot.segments){const style=snapshot.styles[s.styleId],key=JSON.stringify([s.text,style]);let b=cache.get(key);if(!b){b=captionBounds(s.text,style,width,height);cache.set(key,b);}
  if(b.left< -.5||b.top< -.5||b.right>width+.5||b.bottom>height+.5)out.push({severity:'warning',kind:'caption',time:s.start,end:s.end,message:'Napis wychodzi poza kadr i może zostać ucięty.'});
  else if(margins&&(b.left<width*margins.left/100||b.right>width*(1-margins.right/100)||b.top<height*margins.top/100||b.bottom>height*(1-margins.bottom/100)))out.push({severity:'warning',kind:'caption',time:s.start,end:s.end,message:'Napis wychodzi poza wybraną strefę bezpieczną.'});
  if(out.length>=1000){out.push({severity:'warning',kind:'caption',message:'Pokazano pierwsze 1000 ostrzeżeń dotyczących napisów.'});break;}
 }
 return out;
}
