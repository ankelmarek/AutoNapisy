import { beforeEach, describe, expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke, convertFileSrc: vi.fn() }));
import { transcription, type TaskStatus } from "../src/transcription";
import { applyTranscript, newProject } from "../src/model";
const status = (
  state: TaskStatus["state"],
  extra: Partial<TaskStatus> = {},
): TaskStatus => ({
  id: 7,
  state,
  message: "test fixture",
  progress: null,
  segments: null,
  audioDuration: null,
  ...extra,
});
beforeEach(() => {
  invoke.mockReset();
});
describe("adapter transkrypcji", () => {
  it("przekazuje tylko ścieżkę i zwraca wynik backendu", async () => {
    const segments = [
      {
        id: "a",
        text: "Zażółć",
        start: 0,
        end: 1,
        words: [],
        styleId: "default",
      },
    ];
    invoke
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(status("completed", { segments }));
    expect(
      await transcription.transcribe({
        path: "C:/Łódź/film.mp4",
        name: "film",
      }),
    ).toEqual(segments);
    expect(invoke).toHaveBeenNthCalledWith(1, "start_transcription", {
      path: "C:/Łódź/film.mp4",
    });
  });
  it("raportuje rzeczywisty postęp", async () => {
    vi.useFakeTimers();
    try {
      invoke
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(status("transcribing", { progress: 35 }))
        .mockResolvedValueOnce(status("completed", { segments: [] }));
      const progress = vi.fn();
      const promise = transcription.transcribe(
        { path: "a", name: "a" },
        undefined,
        progress,
      );
      await vi.runAllTimersAsync();
      expect(await promise).toEqual([]);
      expect(progress.mock.calls[0][0].progress).toBe(35);
    } finally {
      vi.useRealTimers();
    }
  });
  it("odrzuca błąd bez udawania pustej transkrypcji", async () => {
    invoke
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(
        status("failed", { message: "Brak ścieżki audio" }),
      )
      .mockResolvedValue(undefined);
    await expect(
      transcription.transcribe({ path: "a", name: "a" }),
    ).rejects.toThrow("Brak ścieżki audio");
  });
  it("anulowane zadanie nie zwraca częściowych wyników", async () => {
    invoke
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(status("cancelled"))
      .mockResolvedValue(undefined);
    await expect(
      transcription.transcribe({ path: "a", name: "a" }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("nie uruchamia zadania z anulowanym sygnałem", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      transcription.transcribe({ path: "a", name: "a" }, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(invoke).not.toHaveBeenCalled();
  });
  it("wysyła anulowanie po rozpoczęciu", async () => {
    const controller = new AbortController();
    invoke.mockImplementation(async (command: string) => {
      if (command === "start_transcription") {
        controller.abort();
        return 7;
      }
      if (command === "transcription_status") return status("cancelled");
    });
    await expect(
      transcription.transcribe({ path: "a", name: "a" }, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(invoke).toHaveBeenCalledWith("cancel_transcription", { id: 7 });
  });
  it("nie przyjmuje ukończonego zadania bez wyniku", async () => {
    invoke
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(status("completed"))
      .mockResolvedValue(undefined);
    await expect(
      transcription.transcribe({ path: "a", name: "a" }),
    ).rejects.toThrow("Brak segmentów");
  });
});
describe("zastosowanie wyniku", () => {
  it("nie modyfikuje poprzedniego projektu przy błędnym wyniku", () => {
    const project = newProject();
    const before = JSON.stringify(project);
    expect(() =>
      applyTranscript(project, [
        {
          id: "x",
          text: "a",
          start: -1,
          end: 1,
          words: [],
          styleId: "default",
        },
      ]),
    ).toThrow();
    expect(JSON.stringify(project)).toBe(before);
  });
  it("ogranicza koniec segmentu i słów do metadanych filmu", () => {
    const p = newProject();
    p.media = { path: "a", name: "a", duration: 1 };
    const updated = applyTranscript(p, [
      {
        id: "x",
        text: "a",
        start: 0,
        end: 1.01,
        words: [{ text: "a", start: 0, end: 1.01 }],
        styleId: "default",
      },
    ]);
    expect(updated.segments[0].end).toBe(1);
    expect(updated.segments[0].words[0].end).toBe(1);
    expect(p.segments).toEqual([]);
  });
});
