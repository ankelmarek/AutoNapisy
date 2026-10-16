import type { Project } from "./model";
export type CaptionStyle = Project["styles"][string];
export type CaptionCard = {
  id: string;
  text: string;
  start: number;
  end: number;
  styleId: string;
};
const dangling = new Set([
  "a",
  "i",
  "o",
  "u",
  "w",
  "z",
  "na",
  "do",
  "od",
  "po",
  "za",
  "ze",
  "we",
  "że",
  "nie",
  "przed",
  "przede",
  "pod",
  "nad",
  "dla",
]);
const lastWord = (text: string) =>
  text.trim().split(/\s+/).at(-1)?.toLocaleLowerCase("pl") ?? "";
export const referenceText = "Ale przede mną kierowca całego województwa";
export const yellowPreset: CaptionStyle = {
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
};

/** Balanced whole-word lines. The caller supplies actual font metrics in preview. */
export function wrapCaption(
  text: string,
  style: CaptionStyle,
  measure: (text: string) => number = (s) => s.length,
  maxWidth = style.charsPerLine,
): string[] {
  const display = style.uppercase ? text.toLocaleUpperCase("pl") : text;
  const explicit = display
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (explicit.length > 1 && explicit.length <= style.maxLines) return explicit;
  const normalized = display.trim().replace(/\s+/g, " ");
  if (!normalized) return [];
  const words = normalized.split(" ");
  const count = Math.min(
    style.maxLines,
    words.length,
    Math.max(
      1,
      Math.ceil(normalized.length / style.charsPerLine),
      Math.ceil(measure(normalized) / Math.max(maxWidth, 1)),
    ),
  );
  if (count === 1) return [normalized];
  const cache = new Map<string, { cost: number; lines: string[] }>();
  const solve = (
    from: number,
    left: number,
  ): { cost: number; lines: string[] } => {
    const key = `${from}:${left}`;
    const existing = cache.get(key);
    if (existing) return existing;
    if (left === 0)
      return { cost: from === words.length ? 0 : Infinity, lines: [] };
    let best = { cost: Infinity, lines: [] as string[] };
    const target = measure(normalized) / count;
    for (let to = from + 1; to <= words.length - (left - 1); to++) {
      if (left === 1 && to !== words.length) continue;
      const line = words.slice(from, to).join(" "),
        width = measure(line);
      const overflow = Math.max(0, width - maxWidth) / Math.max(maxWidth, 1);
      const balance = (width - target) / Math.max(target, 1);
      const orphan = left > 1 && dangling.has(lastWord(line)) ? 8 : 0;
      const lone = to - from === 1 && words.length > count + 1 ? 2 : 0;
      const rest = solve(to, left - 1);
      const cost =
        overflow * overflow * 100 +
        balance * balance +
        orphan +
        lone +
        rest.cost;
      if (cost < best.cost) best = { cost, lines: [line, ...rest.lines] };
    }
    cache.set(key, best);
    return best;
  };
  return solve(0, count).lines;
}

/** Card boundaries use real word starts. No proportional/guessed word timestamps. */
export function captionCards(
  segment: Project["segments"][number],
  style: CaptionStyle,
): CaptionCard[] {
  const plain = segment.text.trim().replace(/\s+/g, " ");
  if (!plain) return [];
  const words = segment.words;
  const matches =
    words.length > 0 &&
    words
      .map((w) => w.text.trim())
      .join(" ")
      .replace(/\s+/g, " ") === plain &&
    words.every(
      (w, i) =>
        w.end > w.start &&
        w.start >= segment.start &&
        w.end <= segment.end &&
        (i === 0 || w.start >= words[i - 1].end),
    );
  if (!matches || segment.text.includes("\n"))
    return [
      {
        id: segment.id,
        text: segment.text,
        start: segment.start,
        end: segment.end,
        styleId: segment.styleId,
      },
    ];
  const cards: CaptionCard[] = [];
  for (let from = 0; from < words.length; ) {
    let to = from;
    while (to < words.length) {
      const candidate = words
        .slice(from, to + 1)
        .map((w) => w.text.trim())
        .join(" ");
      if (
        to > from &&
        (to - from >= style.wordsPerCard ||
          candidate.length > style.charsPerLine * style.maxLines)
      )
        break;
      to++;
      if (to - from >= 3 && /[.!?…]$/.test(words[to - 1].text)) break;
    }
    if (
      to < words.length &&
      to - from > 1 &&
      dangling.has(lastWord(words[to - 1].text))
    )
      to--;
    const start = from === 0 ? segment.start : words[from].start;
    const end = to === words.length ? segment.end : words[to].start;
    if (end <= start)
      return [
        {
          id: segment.id,
          text: segment.text,
          start: segment.start,
          end: segment.end,
          styleId: segment.styleId,
        },
      ];
    cards.push({
      id: `${segment.id}:card:${cards.length}`,
      text: words
        .slice(from, to)
        .map((w) => w.text.trim())
        .join(" "),
      start,
      end,
      styleId: segment.styleId,
    });
    from = to;
  }
  return cards;
}

export function activeCaption(
  cards: CaptionCard[],
  time: number,
): CaptionCard | null {
  return cards.reduce<CaptionCard | null>(
    (best, card) =>
      card.start <= time &&
      time < card.end &&
      (!best || card.start >= best.start)
        ? card
        : best,
    null,
  );
}

export function captionExport(project: Project): Project {
  return {
    ...project,
    segments: project.segments.flatMap((s) => {
      const style = project.styles[s.styleId];
      let measure: (text: string) => number = (text) => text.length;
      let width = style.charsPerLine;
      if (typeof document !== "undefined") {
        const ctx = document.createElement("canvas").getContext("2d");
        if (ctx) {
          ctx.font = `${style.fontSize}px "${style.fontFamily}"`;
          measure = (text) => ctx.measureText(text).width;
          width =
            (720 * style.boxWidth) / 100 -
            Math.min(style.fontSize * 0.55, 720 * 0.06) * 2;
        }
      }
      return captionCards(s, style).map((c) => ({
        ...c,
        text: wrapCaption(c.text, style, measure, width).join("\n"),
        words: [],
      }));
    }),
  };
}
