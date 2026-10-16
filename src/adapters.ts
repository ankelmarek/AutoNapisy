import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Project } from "./model";
import { compositionSegments } from "./editing";
export type Media = { path: string; name: string };
export interface PreviewAdapter {
  import(): Promise<Media | null>;
  prepare(path: string): Promise<string>;
}
export const preview: PreviewAdapter = {
  import: () => invoke("import_video"),
  prepare: async (path) =>
    convertFileSrc(await invoke<string>("prepare_preview", { path })),
};
export { transcription, type TranscriptionService } from "./transcription";
export interface SynchronizationAdapter {
  activeSegments(project: Project, time: number): Project["segments"];
}
export const synchronization: SynchronizationAdapter = {
  activeSegments: (p, t) => (p.clips === null ? p.segments : compositionSegments(p)).filter((s) => s.start <= t && t < s.end),
};
export { rendering, type RenderingAdapter } from "./rendering";
export type Diagnostics = {
  os: string;
  arch: string;
  cpu: string;
  logicalCpus: number;
  memoryBytes: number;
  components: { name: string; status: string }[];
};
export const backend = {
  open: () => invoke<{ json: string; path: string } | null>("open_project"),
  save: (json: string) => invoke<string | null>("save_project", { json }),
  diagnostics: () => invoke<Diagnostics>("diagnostics"),
  exportSrt: (json: string, captions: string) => invoke<string | null>("export_srt", { json, captions }),
};
