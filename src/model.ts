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
    schemaVersion: z.literal(2),
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
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 1
  )
    return { ...value, schemaVersion: 2 };
  return value;
}, currentProjectSchema);
export type Project = z.infer<typeof projectSchema>;
export const newProject = (): Project => ({
  schemaVersion: 2,
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
