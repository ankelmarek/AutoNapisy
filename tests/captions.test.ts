import {legacyFixture} from './legacyFixture';
import { describe, it, expect } from "vitest";
import {
  captionCards,
  captionExport,
  activeCaption,
  wrapCaption,
  yellowPreset,
  referenceText,
} from "../src/captions";
import { newProject, parseProject, serializeProject } from "../src/model";
import { fitVideoRect } from "../src/CaptionOverlay";
const segment = (text: string) => ({
  id: "a",
  text,
  start: 0,
  end: 10,
  words: [],
  styleId: "default",
});
describe("skład napisów", () => {
  it("łamie przykład na dwie kompletne linie", () => {
    expect(wrapCaption(referenceText, yellowPreset)).toEqual([
      "ALE PRZEDE MNĄ KIEROWCA",
      "CAŁEGO WOJEWÓDZTWA",
    ]);
  });
  it("nie zostawia samotnego przyimka na końcu linii", () => {
    const lines = wrapCaption(
      "Jedziemy teraz do naszego pięknego miasta",
      yellowPreset,
    );
    expect(lines.slice(0, -1).every((l) => !/(^| )(W|Z|DO|NA)$/.test(l))).toBe(
      true,
    );
    expect(lines.join(" ")).toBe("JEDZIEMY TERAZ DO NASZEGO PIĘKNEGO MIASTA");
  });
  it("zachowuje ręczne łamanie i polskie litery", () => {
    expect(wrapCaption("Żółć i źdźbło\nŁódź", yellowPreset)).toEqual([
      "ŻÓŁĆ I ŹDŹBŁO",
      "ŁÓDŹ",
    ]);
  });
  it("nie obcina długich słów ani długiego segmentu", () => {
    const text = Array(100).fill("najdłuższywyraz").join(" ");
    const lines = wrapCaption(text, yellowPreset);
    expect(lines.length).toBe(2);
    expect(lines.join(" ")).toBe(text.toLocaleUpperCase("pl"));
  });
  it("bez czasów słów nie wymyśla podziału czasu", () => {
    const s = segment("jeden dwa trzy cztery pięć sześć siedem osiem dziewięć");
    expect(captionCards(s, yellowPreset)).toEqual([
      { id: "a", text: s.text, start: 0, end: 10, styleId: "default" },
    ]);
  });
  it("dzieli plansze po rzeczywistych początkach słów, bez luk", () => {
    const s = {
      ...segment("jeden dwa trzy cztery pięć sześć"),
      words: ["jeden", "dwa", "trzy", "cztery", "pięć", "sześć"].map(
        (text, i) => ({ text, start: i, end: i + 0.8 }),
      ),
    };
    const cards = captionCards(s, { ...yellowPreset, wordsPerCard: 3 });
    expect(cards.map((c) => [c.start, c.end])).toEqual([
      [0, 3],
      [3, 10],
    ]);
    expect(cards.map((c) => c.text).join(" ")).toBe(s.text);
  });
  it("niespójne słowa pozostawiają cały segment", () => {
    const s = {
      ...segment("Nowy tekst"),
      words: [{ text: "Stary", start: 0, end: 1 }],
    };
    expect(captionCards(s, yellowPreset)).toHaveLength(1);
    expect(captionCards(s, yellowPreset)[0].text).toBe("Nowy tekst");
  });
  it("SRT dostaje plansze i linie bez zmiany oryginalnego tekstu", () => {
    const p = newProject();
    p.segments = [segment(referenceText)];
    const exported = captionExport(p);
    expect(exported.segments[0].text).toContain("\n");
    expect(p.segments[0].text).toBe(referenceText);
    expect(exported.segments[0].words).toEqual([]);
  });
  it("obsługuje ręczne wyłączenie wielkich liter", () => {
    expect(wrapCaption("Łódź", { ...yellowPreset, uppercase: false })).toEqual([
      "Łódź",
    ]);
  });
});
describe("migracja i geometria", () => {
  it("pokazuje pojedynczą planszę na granicach i przy nakładaniu", () => {
    const a = { id: "a", text: "a", start: 0, end: 2, styleId: "default" },
      b = { ...a, id: "b", start: 1, end: 3 };
    expect(activeCaption([a, b], 1)?.id).toBe("b");
    expect(activeCaption([a, b], 3)).toBe(null);
  });
  it("migruje v1, zachowując stary kolor i font", () => {
    const p = newProject();
    const old = {
      ...p,
      schemaVersion: 1,
      styles: {
        default: {
          fontFamily: "Arial",
          fontSize: 42,
          color: "#ffffff",
          background: "#111111",
          position: "bottom",
        },
      },
    };
    const migrated = parseProject(JSON.stringify(legacyFixture(old)));
    expect(migrated.schemaVersion).toBe(12);
    expect(migrated.styles.default.uppercase).toBe(false);
    expect(migrated.styles.default.fontFamily).toBe("Arial");
    expect(parseProject(serializeProject(migrated))).toEqual({
      ...migrated,
      updatedAt: expect.any(String),
    });
  });
  it("wyznacza obraz z pominięciem czarnych pasów", () => {
    expect(fitVideoRect(800, 600, 1920, 1080)).toEqual({
      left: 0,
      top: 75,
      width: 800,
      height: 450,
    });
    expect(fitVideoRect(800, 450, 1080, 1920).width).toBeCloseTo(253.125);
  });
});
