// Pure data-shaping for the "classification average" panel: the exact five
// values the live view's JUST CLASSIFIED spotlight shows for one song
// (theme, mood, complexity, explicit, first-person), averaged across a whole
// discography instead. Shared by every renderer — the Ink spotlight, the Ink
// dashboard panel it settles into, and render-terminal.ts's plain-text
// equivalent — so none of them can drift on which rows exist, what they're
// labeled, or the scale each one is drawn against.
import { clamp } from "./colors.js";
import { average, type VisualizationData } from "./data.js";
import type { SongClassification } from "../types.js";

/** Panel title, shared so the Ink and plain-text dashboards can't drift on wording. */
export const AVERAGES_PANEL_TITLE = "CLASSIFICATION AVERAGE";

// Column geometry for one stat row: `label` (left-aligned, fixed) + bar +
// value. Lives here rather than in StatBar.tsx so render-terminal.ts's
// plain-text rows line up at the same columns as the Ink ones.
export const STAT_LABEL_WIDTH = 12;
export const STAT_BAR_WIDTH = 16;

/** Which SongClassification fields render as bars, in the order they're drawn. */
export type ClassificationStatKey = "mood" | "complexity" | "explicit" | "firstPerson";

export interface ClassificationStatSpec {
  key: ClassificationStatKey;
  label: string;
  /** Top of the scale the bar is drawn against — Jev's own range for that field (see src/jev.ts). */
  max: number;
  hex: string;
}

/**
 * The bar rows, in draw order. Deliberately flat per-row colors rather than
 * the mood gradient the SONGS table uses: here the color identifies *which
 * attribute* a row is, and a gradient would make the same row change color
 * between two artists.
 */
export const CLASSIFICATION_STAT_SPECS: readonly ClassificationStatSpec[] = [
  { key: "mood", label: "mood", max: 4, hex: "#22c55e" },
  { key: "complexity", label: "complexity", max: 3, hex: "#a78bfa" },
  { key: "explicit", label: "explicit", max: 1, hex: "#f87171" },
  { key: "firstPerson", label: "1st person", max: 1, hex: "#60a5fa" },
];

/** Just the bar-row values — `SongClassification` structurally satisfies this, so a single song can feed the same component. */
export type ClassificationStatValues = Record<ClassificationStatKey, number>;

export interface ClassificationAverages {
  songCount: number;
  albumCount: number;
  /** The most-classified theme and its share of the discography (0..1) — the closest thing to an "average theme". */
  topTheme: { theme: string; share: number };
  /** Mean themeConfidence across every song: how sure Jev was, on average, about the theme it picked. */
  themeConfidence: number;
  values: ClassificationStatValues;
}

/** Averages every bar row across the whole discography. Returns null when there's nothing classified yet, so callers can skip the panel entirely. */
export function computeClassificationAverages(data: VisualizationData): ClassificationAverages | null {
  const [first] = data.songs;
  if (!first) return null;

  // themeDistribution is derived from the same songs and sorted by count, so
  // it's non-empty whenever songs are — the fallback only satisfies the type.
  const top = data.themeDistribution[0] ?? { theme: first.theme, percentage: 100 };

  return {
    songCount: data.songs.length,
    albumCount: data.albums.length,
    topTheme: { theme: top.theme, share: top.percentage / 100 },
    themeConfidence: average(data.songs.map((s) => s.themeConfidence)),
    values: averageStatValues(data.songs),
  };
}

/** Mean of each bar row's field across `songs`. */
export function averageStatValues(songs: SongClassification[]): ClassificationStatValues {
  return {
    mood: average(songs.map((s) => s.mood)),
    complexity: average(songs.map((s) => s.complexity)),
    explicit: average(songs.map((s) => s.explicit)),
    firstPerson: average(songs.map((s) => s.firstPerson)),
  };
}

/** The dim `across 42 songs · 6 albums` context line under the panel title — the aggregate's answer to the spotlight's song title. */
export function averagesSubtitle(averages: ClassificationAverages): string {
  const songs = `${averages.songCount} song${averages.songCount === 1 ? "" : "s"}`;
  const albums = `${averages.albumCount} album${averages.albumCount === 1 ? "" : "s"}`;
  return `across ${songs} · ${albums}`;
}

/**
 * How many of `width` cells a bar fills for `value` on a 0..max scale.
 * Whole cells only (no eighth-block precision, unlike the SONGS table bars)
 * — these bars animate cell-by-cell during the spotlight reveal, where a
 * partial trailing cell reads as flicker rather than as precision.
 */
export function statBarFill(value: number, max: number, width = STAT_BAR_WIDTH): number {
  if (max <= 0) return 0;
  return clamp(Math.round((value / max) * width), 0, width);
}
