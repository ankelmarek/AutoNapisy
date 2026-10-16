import { invoke } from "@tauri-apps/api/core";
import { serializeProject, type Project } from "./model";
import { compositionProject, editDuration } from "./editing";
import { captionExport } from "./captions";
import { createFrameRenderer, ensureCaptionFonts } from "./captionCanvas";
export type ExportInfo = {
  width: number;
  height: number;
  duration: number;
  frames: number;
  received: number;
  outputPath: string;
};
export type ExportStatus = {
  id: number;
  state:
    | "preparing"
    | "awaiting_frames"
    | "rendering"
    | "cancelling"
    | "completed"
    | "cancelled"
    | "failed";
  message: string;
  progress: number | null;
  outputPath: string | null;
  exportInfo: ExportInfo | null;
};
export interface RenderingAdapter {
  render(
    project: Project,
    signal?: AbortSignal,
    onStatus?: (status: ExportStatus) => void,
  ): Promise<string | null>;
}
const aborted = () => new DOMException("Anulowano eksport", "AbortError");
const check = (signal?: AbortSignal) => {
  if (signal?.aborted) throw aborted();
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 400));
export const rendering: RenderingAdapter = {
  async render(project, signal, onStatus) {
    check(signal);
    if (!project.media || editDuration(project)<=0)
      throw new Error("Zaimportuj film i przygotuj montaż");
    await ensureCaptionFonts(project);
    check(signal);
    const snapshot = captionExport(compositionProject(project));
    const id = await invoke<number | null>("begin_video_export", {
      json: serializeProject(project),
      captions: JSON.stringify(snapshot.segments),
    });
    if (id == null) return null;
    let cancelSent = false;
    const cancel = () => {
      if (!cancelSent) {
        cancelSent = true;
        void invoke("cancel_video_export", { id }).catch(() => {
          cancelSent = false;
        });
      }
    };
    signal?.addEventListener("abort", cancel);
    const status = async () => {
      if (signal?.aborted) cancel();
      const result = await invoke<ExportStatus>("transcription_status", { id });
      onStatus?.(result);
      if (result.state === "failed") throw new Error(result.message);
      if (result.state === "cancelled") throw aborted();
      return result;
    };
    try {
      let current = await status();
      while (current.state !== "awaiting_frames") {
        if (current.state === "completed") return current.outputPath;
        await pause();
        current = await status();
      }
      check(signal);
      const info = current.exportInfo;
      if (!info || info.frames !== snapshot.segments.length)
        throw new Error("Nieprawidłowe parametry eksportu");
      const frame = createFrameRenderer(info.width, info.height);
      for (let index = 0; index < snapshot.segments.length; index++) {
        check(signal);
        const segment = snapshot.segments[index];
        const png = await frame(segment.text, snapshot.styles[segment.styleId]);
        check(signal);
        const update = await invoke<ExportStatus>("upload_export_frame", {
          id,
          index,
          png,
        });
        onStatus?.(update);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      check(signal);
      await invoke("finish_export_frames", { id });
      for (;;) {
        const result = await status();
        if (result.state === "completed") {
          if (!result.outputPath)
            throw new Error("Brak ścieżki zakończonego eksportu");
          return result.outputPath;
        }
        await pause();
      }
    } catch (error) {
      cancel();
      throw error;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  },
};
