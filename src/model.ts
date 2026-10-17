import { z } from "zod";
const time = z.number().finite().nonnegative();
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
const currentProjectSchema = z
  .object({
    schemaVersion: z.literal(5),
    captionEdits:z.record(z.object({trimStart:time,trimEnd:time,text:z.string().max(100000).optional(),hidden:z.boolean().optional()}).strict()).default({}),
    transitions:z.array(z.object({id:z.string().min(1),fromId:z.string().min(1),toId:z.string().min(1),kind:z.enum(['left','right','black']),duration:z.number().min(.1).max(2)}).strict()).max(99).default([]),
    assets: z.array(z.object({id:z.string().min(1),path:z.string().min(1),name:z.string(),duration:time,kind:z.enum(["video","audio"]),segments:z.array(segment)}).strict()).max(100).default([]),
    clips: z.array(z.object({id:z.string().min(1),sourceIn:time,sourceOut:time,start:time,assetId:z.string().optional(),track:z.union([z.literal(0),z.literal(1)]).optional(),kind:z.enum(["video","audio"]).optional(),volume:z.number().min(0).max(1).optional(),adjustments:z.object({brightness:z.number().min(.25).max(2),contrast:z.number().min(.25).max(2),saturation:z.number().min(0).max(2)}).strict().optional()}).strict()).max(100).nullable(),
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
    const clips = [...(p.clips ?? [])].sort((a,b)=>a.start-b.start);
    const asset = (clip:typeof clips[number]) => clip.assetId ? p.assets.find(a=>a.id===clip.assetId) : p.media;
    if(new Set(p.assets.map(a=>a.id)).size!==p.assets.length || p.assets.some(a=>a.id==='primary' || a.duration<.05 || a.segments.some(s=>s.end>a.duration || !p.styles[s.styleId])))c.addIssue({code:'custom',message:'Nieprawidłowe źródła'});
    if (new Set(clips.map(c=>c.id)).size !== clips.length || clips.some((clip,i)=> {
      const m=asset(clip);
      return !m || m.duration==null || clip.sourceOut-clip.sourceIn < .049999 || clip.sourceOut>m.duration+1e-6 || clip.start+clip.sourceOut-clip.sourceIn>86400 ||
        (clip.kind!=='audio' && 'kind' in m && m.kind==='audio') ||
        (clip.kind!=='audio' && clips.slice(0,i).some(o=>o.kind!=='audio' && (o.track??0)===(clip.track??0) && clip.start<o.start+o.sourceOut-o.sourceIn-1e-6));
    })) c.addIssue({code:'custom',message:'Nieprawidłowe lub nakładające się ujęcia na tej samej ścieżce wideo'});
    const toIds=new Set<string>();
    if(new Set(p.transitions.map(t=>t.id)).size!==p.transitions.length||p.transitions.some(t=>{
      const a=clips.find(c=>c.id===t.fromId),b=clips.find(c=>c.id===t.toId);
      const invalid=!a||!b||a.kind==='audio'||b.kind==='audio'||(a.track??0)!==(b.track??0)||Math.abs(a.start+a.sourceOut-a.sourceIn-b.start)>1e-6||b.sourceIn<t.duration-1e-6||a.sourceOut-a.sourceIn<t.duration-1e-6||toIds.has(t.toId);toIds.add(t.toId);return invalid;
    }))c.addIssue({code:'custom',message:'Nieprawidłowe połączenie przejścia'});
    if(Object.keys(p.captionEdits).length>10000)c.addIssue({code:'custom',message:'Zbyt wiele zmian napisów'});
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
  if (value && typeof value==='object' && 'schemaVersion' in value && [1,2,3,4].includes(Number(value.schemaVersion))) {
    const p=value as {media?:{duration?:number};schemaVersion:number;clips?:unknown};
    return {...value,assets:[],...value,captionEdits:{},transitions:[],schemaVersion:5,clips:p.schemaVersion>=3 ? p.clips : p.media?.duration ? [{id:'original',sourceIn:0,sourceOut:p.media.duration,start:0}] : null};
  }
  return value;
}, currentProjectSchema);
export type Project = z.infer<typeof projectSchema>;
export const newProject = (): Project => ({
  schemaVersion: 5,
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
