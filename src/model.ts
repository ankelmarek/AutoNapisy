import { z } from "zod";
import {MAX_TRACKS,defaultTrackLayout,trackId,routedAudio} from "./trackModel";
import {transitionKinds,legacyTransition} from "./transitionCatalog";
const time = z.number().finite().nonnegative();
const trackState=z.object({muted:z.boolean().optional(),hidden:z.boolean().optional(),locked:z.boolean().optional(),ripple:z.enum(["auto","on","off"]).optional()}).strict();
const tracksSchema=z.record(z.string().regex(/^(T|[VA]([1-9]|1[0-6]))$/),trackState);
const trackLayoutSchema=z.array(z.object({id:z.string(),kind:z.enum(["video","audio"]),index:z.number().int().min(0).max(MAX_TRACKS-1)}).strict()).min(4).max(MAX_TRACKS*2);
export const styleSchema = z
  .object({
    fontFamily: z.string().min(1).max(100),
    fontSize: z.number().min(12).max(100),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    position: z.enum(["bottom", "center", "top"]),
    uppercase: z.boolean().default(false),
    maxLines: z.number().int().min(1).max(3).default(2),
    charsPerLine: z.number().int().min(12).max(48).default(24),
    wordsPerCard: z.number().int().min(3).max(16).default(8),
    boxWidth: z.number().min(40).max(95).default(84),
    cornerRadius: z.number().min(0).max(60).default(10),
    marginPercent: z.number().min(0).max(30).default(8),
    animation:z.object({preset:z.enum(['karaoke-flow','pop-beat','impact','neon','slide-reveal','marker','editorial','type-flow']),version:z.literal(1),accentColor:z.string().regex(/^#[0-9a-fA-F]{6}$/),speed:z.number().finite().min(.5).max(2),intensity:z.number().finite().min(0).max(1),enabled:z.boolean().optional()}).strict().optional(),
    effect:z.enum(['box','outline','highlight']).optional(),
    outlineColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    outlineWidth:z.number().min(0).max(8).optional(),
  })
  .strict();
const word = z
  .object({ text: z.string(), start: time, end: time })
  .strict()
  .refine((x) => x.end >= x.start, "Nieprawidłowy czas słowa");
const segment = z
  .object({
    id: z.string().min(1),
    text: z.string(),
    start: time,
    end: time,
    words: z.array(word),
    styleId: z.string(),
  })
  .strict()
  .superRefine((x, c) => {
    if (
      x.end < x.start ||
      x.words.some((w) => w.start < x.start || w.end > x.end)
    )
      c.addIssue({ code: "custom", message: "Nieprawidłowy zakres segmentu" });
  });
export const transformSchema=z.object({scale:z.number().finite().min(.1).max(4),x:z.number().finite().min(-2).max(2),y:z.number().finite().min(-2).max(2)}).strict();
export const provenanceSchema=z.object({provider:z.enum(['kenney','openverse']),externalId:z.string().max(200),title:z.string().max(2000),creator:z.string().max(2000),license:z.string().max(100),licenseUrl:z.string().max(2000),sourceUrl:z.string().max(2000),attribution:z.string().max(10000)}).strict();
const fadeSchema=z.object({anchor:time,duration:z.number().finite().positive().max(86400)}).strict();
export const audioEnvelopeSchema=z.object({points:z.array(z.object({id:z.string().min(1).max(100),time,gain:z.number().finite().min(0).max(1)}).strict()).max(64),fadeIn:fadeSchema.optional(),fadeOut:fadeSchema.optional()}).strict();
const currentProjectSchema = z
  .object({
    schemaVersion: z.literal(18),
    masterAudio:z.object({gainDb:z.number().finite().min(-60).max(24),normalization:z.object({targetLufs:z.number().finite().min(-30).max(-9),basis:z.string().regex(/^[0-9a-f]{16}$/),stale:z.boolean().optional()}).strict().optional()}).strict().default({gainDb:0}),
    trackLayout:trackLayoutSchema.default(defaultTrackLayout),
    rippleEnabled:z.boolean().default(false),
    canvas:z.object({width:z.number().int().min(128).max(3840).multipleOf(2),height:z.number().int().min(128).max(3840).multipleOf(2)}).strict().nullable().default(null),
    tracks:tracksSchema.default({}),
    timelineSegments:z.array(segment).nullable().default(null),
    captionEdits:z.record(z.object({trimStart:time,trimEnd:time,offset:z.number().finite().min(-86400).max(86400).optional(),text:z.string().max(100000).optional(),textTiming:z.discriminatedUnion('mode',[z.object({mode:z.literal('inherited'),sourceText:z.string().min(1).max(100000)}).strict(),z.object({mode:z.literal('board')}).strict(),z.object({mode:z.literal('manual'),sourceText:z.string().min(1).max(100000),duration:z.number().finite().positive().max(86400),words:z.array(word).min(1).max(256)}).strict(),z.object({mode:z.literal('reanalyzed'),sourceText:z.string().min(1).max(100000),duration:z.number().finite().positive().max(86400),words:z.array(word).min(1).max(256)}).strict()]).optional(),hidden:z.boolean().optional(),styleId:z.string().min(1).max(100).optional()}).strict()).default({}),
    transitions:z.array(z.object({id:z.string().min(1),fromId:z.string().min(1),toId:z.string().min(1),kind:z.enum(transitionKinds),duration:z.number().min(.1).max(2)}).strict()).max(99).default([]),
    assets: z.array(z.object({id:z.string().min(1),path:z.string().min(1),name:z.string(),duration:time,kind:z.enum(["video","audio"]),provenance:provenanceSchema.optional(),segments:z.array(segment)}).strict()).max(100).default([]),
    clips: z.array(z.object({id:z.string().min(1),sourceIn:time,sourceOut:time,start:time,assetId:z.string().optional(),track:z.number().int().min(0).max(MAX_TRACKS-1).optional(),audioRoute:z.string().regex(/^(embedded|A([1-9]|1[0-6]))$/).optional(),kind:z.enum(["video","audio"]).optional(),volume:z.number().min(0).max(1).optional(),audio:audioEnvelopeSchema.optional(),audioDetached:z.boolean().optional(),syncGroup:z.string().min(1).max(100).optional(),crossfade:z.object({fadeIn:fadeSchema.optional(),fadeOut:fadeSchema.optional()}).strict().optional(),transform:transformSchema.optional(),adjustments:z.object({brightness:z.number().min(.25).max(2),contrast:z.number().min(.25).max(2),saturation:z.number().min(0).max(2)}).strict().optional()}).strict()).max(100).nullable(),
    name: z.string().min(1).max(200),
    media: z
      .object({
        path: z.string().min(1),
        name: z.string(),
        duration: time.nullable(),
      })
      .strict()
      .nullable(),
    segments: z.array(segment),
    styles: z.record(styleSchema),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((p, c) => {
    const ids=new Set(p.trackLayout.map(t=>t.id));
    if(ids.size!==p.trackLayout.length||p.trackLayout.some(t=>t.id!==trackId(t.kind,t.index))||['V1','V2','A1','A2'].some(id=>!ids.has(id))||Object.keys(p.tracks).some(id=>id!=='T'&&!ids.has(id)))c.addIssue({code:'custom',message:'Nieprawidłowa lista ścieżek'});
    for(const clip of p.clips??[]){const audio=routedAudio(clip);if(!ids.has(trackId(clip.kind==='audio'?'audio':'video',clip.track??0))||(clip.kind==='audio'&&clip.audioRoute!==undefined)||(audio!==null&&!ids.has(trackId('audio',audio))))c.addIssue({code:'custom',message:'Klip wskazuje nieistniejącą ścieżkę'});}
    const clips = [...(p.clips ?? [])].sort((a,b)=>a.start-b.start);
    const asset = (clip:typeof clips[number]) => clip.assetId ? p.assets.find(a=>a.id===clip.assetId) : p.media;
    if(new Set(p.assets.map(a=>a.id)).size!==p.assets.length || p.assets.some(a=>a.id==='primary' || a.duration<.05 || a.segments.some(s=>s.end>a.duration || !p.styles[s.styleId])))c.addIssue({code:'custom',message:'Nieprawidłowe źródła'});
    if (new Set(clips.map(c=>c.id)).size !== clips.length || clips.some((clip,i)=> {
      const m=asset(clip);
      return !m || m.duration==null || clip.sourceOut-clip.sourceIn < .049999 || clip.sourceOut>m.duration+1e-6 || clip.start+clip.sourceOut-clip.sourceIn>86400 ||
        (clip.kind!=='audio' && 'kind' in m && m.kind==='audio') ||
        (clip.kind!=='audio' && clips.slice(0,i).some(o=>o.kind!=='audio' && (o.track??0)===(clip.track??0) && clip.start<o.start+o.sourceOut-o.sourceIn-1e-6));
    })) c.addIssue({code:'custom',message:'Nieprawidłowe lub nakładające się ujęcia na tej samej ścieżce wideo'});
    for(const clip of clips){
      if((clip.audioDetached && clip.kind==='audio') || (clip.crossfade && clip.kind!=='audio'))c.addIssue({code:'custom',message:'Nieprawidłowe odłączenie audio'});
      const d=asset(clip)?.duration??0;
      for(const a of [clip.audio,clip.crossfade]){if(!a)continue;
      const points=('points' in a?a.points:[]) as {id:string;time:number;gain:number}[];
      if(new Set(points.map(p=>p.id)).size!==points.length||points.some((p,i)=>p.time>d+1e-6||(i>0&&p.time-points[i-1].time<.000999))||
        (a.fadeIn&&(a.fadeIn.anchor+a.fadeIn.duration>d+1e-6))||(a.fadeOut&&(a.fadeOut.anchor>d+1e-6||a.fadeOut.anchor-a.fadeOut.duration< -1e-6)))c.addIssue({code:'custom',message:'Nieprawidłowa obwiednia audio'});
      }
    }
    const toIds=new Set<string>();
    if(new Set(p.transitions.map(t=>t.id)).size!==p.transitions.length||p.transitions.some(t=>{
      const a=clips.find(c=>c.id===t.fromId),b=clips.find(c=>c.id===t.toId);
      const invalid=!a||!b||a.kind==='audio'||b.kind==='audio'||(a.track??0)!==(b.track??0)||Math.abs(a.start+a.sourceOut-a.sourceIn-b.start)>1e-6||b.sourceIn<t.duration-1e-6||a.sourceOut-a.sourceIn<t.duration-1e-6||toIds.has(t.toId);toIds.add(t.toId);return invalid;
    }))c.addIssue({code:'custom',message:'Nieprawidłowe połączenie przejścia'});
    for(const e of Object.values(p.captionEdits)){const t=e.textTiming;if(t&&(t.mode==='manual'||t.mode==='reanalyzed')){const parts=e.text?.trim().split(/\s+/u).filter(Boolean)??[];if(parts.length!==t.words.length||t.words.some((w,i)=>w.text!==parts[i]||w.end<=w.start||w.end>t.duration||(i>0&&w.start<t.words[i-1].end)))c.addIssue({code:'custom',message:'Nieprawidłowe czasy słów korekty'});}}
    if(Object.values(p.captionEdits).some(e=>e.textTiming&&e.text===undefined))c.addIssue({code:'custom',message:'Pochodzenie czasów wymaga tekstu korekty'});
    if(Object.values(p.captionEdits).some(e=>e.styleId!==undefined&&!p.styles[e.styleId]))c.addIssue({code:'custom',message:'Nieznany styl edycji napisu'});
    if(Object.keys(p.captionEdits).length>10000)c.addIssue({code:'custom',message:'Zbyt wiele zmian napisów'});
    const timelineDuration=Math.max(0,...(p.clips??[]).map(c=>c.start+c.sourceOut-c.sourceIn),...(p.clips===null?[p.media?.duration??0]:[]));
    if(p.timelineSegments&&(new Set(p.timelineSegments.map(s=>s.id)).size!==p.timelineSegments.length||p.timelineSegments.some(s=>!p.styles[s.styleId]||s.end>86400)))c.addIssue({code:'custom',message:'Nieprawidłowe napisy montażu'});
    if (!p.styles.default)
      c.addIssue({ code: "custom", message: "Brak stylu domyślnego" });
    if (
      new Set(p.segments.map((s) => s.id)).size !== p.segments.length ||
      p.segments.some(
        (s) =>
          !p.styles[s.styleId] ||
          (p.media?.duration != null && s.end > p.media.duration),
      )
    )
      c.addIssue({
        code: "custom",
        message: "Nieprawidłowe identyfikatory, style lub czasy",
      });
  });
export const projectSchema = z.preprocess((value) => {
  if(value&&typeof value==='object'&&'schemaVersion' in value&&Number(value.schemaVersion)<=17&&'captionEdits' in value&&value.captionEdits&&Object.values(value.captionEdits).some((e:any)=>e?.textTiming&&['manual','reanalyzed'].includes(e.textTiming.mode)))return value;
  if(value&&typeof value==='object'&&'schemaVersion' in value&&value.schemaVersion===17)return {...value,schemaVersion:18};
  if(value&&typeof value==='object'&&'schemaVersion' in value&&Number(value.schemaVersion)<=16&&'captionEdits' in value&&value.captionEdits&&Object.values(value.captionEdits).some((e:any)=>e&&typeof e==='object'&&'textTiming' in e))return value;
  if(value&&typeof value==='object'&&'schemaVersion' in value&&value.schemaVersion===16)return {...value,schemaVersion:18};
  if(value&&typeof value==='object'&&'schemaVersion' in value&&Number(value.schemaVersion)<=15&&'styles' in value&&value.styles&&Object.values(value.styles).some((s:any)=>s?.animation&&typeof s.animation==='object'&&'enabled' in s.animation))return value;
  if(value&&typeof value==='object'&&'schemaVersion' in value&&value.schemaVersion===15)return {...value,schemaVersion:18};
  if(value&&typeof value==='object'&&'schemaVersion' in value&&Number(value.schemaVersion)<=14&&'captionEdits' in value&&value.captionEdits&&Object.values(value.captionEdits).some((e:any)=>e&&e.styleId!==undefined))return value;
  if(value&&typeof value==='object'&&'schemaVersion' in value&&Number(value.schemaVersion)<=14&&'styles' in value&&value.styles&&Object.values(value.styles).some((s:any)=>s&&s.animation!==undefined))return value;
  if(value&&typeof value==='object'&&'schemaVersion' in value&&value.schemaVersion===14)return {...value,schemaVersion:18};
  if(value&&typeof value==='object'&&'schemaVersion' in value&&Number(value.schemaVersion)<=13&&'captionEdits' in value&&value.captionEdits&&Object.values(value.captionEdits).some((e:any)=>e&&'offset' in e))return value;
  if(value&&typeof value==='object'&&'schemaVersion' in value&&value.schemaVersion===13)return {...value,schemaVersion:18};
  if(value&&typeof value==='object'&&'schemaVersion' in value&&Number(value.schemaVersion)<=11&&'masterAudio' in value)return value;
  if(value&&typeof value==='object'&&'schemaVersion' in value&&[11,12].includes(Number(value.schemaVersion))){const p=value as Project,layout=p.trackLayout===undefined?defaultTrackLayout():p.trackLayout;if(!Array.isArray(layout)||layout.some(t=>!t||typeof t!=='object'))return value;return {...p,schemaVersion:18,masterAudio:Number(value.schemaVersion)===11?{gainDb:0}:p.masterAudio,trackLayout:[...layout].sort((a,b)=>a.kind===b.kind?a.index-b.index:a.kind==='video'?-1:1)};}
  if(value&&typeof value==='object'&&'schemaVersion' in value&&[1,2,3,4,5,6,7,8,9,10].includes(Number(value.schemaVersion))){
    const p=value as Project,version=Number(value.schemaVersion);
    // Legacy schemas could never authorize extra tracks or explicit audio routing.
    if('trackLayout' in value||Object.keys(p.tracks??{}).some(k=>!['V1','V2','A1','A2','T'].includes(k))||(p.clips??[]).some(c=>(c.track??0)>1||c.audioRoute!==undefined))return value;
    const clips=version>=3?p.clips:p.media?.duration?[{id:'original',sourceIn:0,sourceOut:p.media.duration,start:0}]:null;
    return {...p,trackLayout:defaultTrackLayout(),assets:p.assets??[],captionEdits:p.captionEdits??{},timelineSegments:version>=6?p.timelineSegments:null,transitions:(p.transitions??[]).map(t=>({...t,kind:legacyTransition(t.kind)})),schemaVersion:18,masterAudio:{gainDb:0},rippleEnabled:version<10?false:p.rippleEnabled,clips:clips?.map(c=>c.kind==='audio'?c:{...c,audioRoute:trackId('audio',c.track??0)})??null};
  }
  return value;
}, currentProjectSchema);
export type Project = z.infer<typeof currentProjectSchema>;
export const newProject = (): Project => ({
  schemaVersion: 18,
  masterAudio:{gainDb:0},
  trackLayout:defaultTrackLayout(),
  rippleEnabled:false,
  canvas:null,
  tracks:{},
  timelineSegments:null,
  captionEdits:{},
  transitions:[],
  assets: [],
  clips: null,
  name: "Nowy projekt",
  media: null,
  segments: [],
  styles: {
    default: {
      fontFamily: "Bebas Neue",
      fontSize: 56,
      color: "#080808",
      background: "#ffe600",
      position: "bottom",
      uppercase: true,
      maxLines: 2,
      charsPerLine: 24,
      wordsPerCard: 8,
      boxWidth: 84,
      cornerRadius: 28,
      marginPercent: 8,
    },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
export function parseProject(json: string): Project {
  return projectSchema.parse(JSON.parse(json));
}
export function serializeProject(project: Project): string {
  return JSON.stringify(
    projectSchema.parse({ ...project, updatedAt: new Date().toISOString() }),
    null,
    2,
  );
}
export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

/** Whisper may round the final segment beyond the video metadata by milliseconds. */
export function applyTranscript(
  project: Project,
  segments: Project["segments"],
): Project {
  const duration = project.media?.duration;
  const bounded =
    duration == null
      ? segments
      : segments
          .filter((s) => s.start < duration)
          .map((s) => {
            const end = Math.min(s.end, duration);
            return {
              ...s,
              end,
              words: s.words
                .filter((w) => w.start < end)
                .map((w) => ({ ...w, end: Math.min(w.end, end) })),
            };
          })
          .filter((s) => s.end > s.start);
  return projectSchema.parse({
    ...project,
    segments: bounded,
    updatedAt: new Date().toISOString(),
  });
}

/** Validate recognition independently from source paths and transition references. */
export function applyTimelineTranscript(project:Project,segments:Project['segments']):Project{
 const duration=Math.max(0,...(project.clips??[]).map(c=>c.start+c.sourceOut-c.sourceIn),...(project.clips===null?[project.media?.duration??0]:[]));
 const clean=applyTranscript({...newProject(),media:{path:'timeline',name:'Montaż',duration},styles:project.styles},segments);
 return projectSchema.parse({...project,timelineSegments:clean.segments,captionEdits:Object.fromEntries(Object.entries(project.captionEdits).filter(([id])=>!id.startsWith('timeline:'))),updatedAt:new Date().toISOString()});
}
