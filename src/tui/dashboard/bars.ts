// Pure rendering math shared by the dashboard's Ink components — no Ink/React
// here, so it's unit-testable the same way src/viz/render-terminal.ts's own
// bar/glyph math already is. This exists because that file bakes its output
// straight into ANSI-embedded strings, which isn't reusable by an Ink
// component (Ink wants { text, color } data, not "\x1b[38;2;..." strings).
import { clamp, moodGradientHex } from "../../viz/colors.js";
import type { AlbumGroup, ThemeDistributionEntry } from "../../viz/data.js";
import { resample } from "../../viz/data.js";
import { themeColor } from "../../viz/theme-palette.js";
import type { SongClassification } from "../../types.js";

const SPARK_CHARS = "▁▂▃▄▅▆▇█";
const EIGHTHS = " ▏▎▍▌▋▊▉█";
export const COMPLEXITY_GLYPHS = ["░", "▒", "▓", "█"];

export interface SparkPoint {
  char: string;
  color: string;
}

/** One colored spark character per (resampled) song, for the mood arc. */
export function moodArcSeries(songs: SongClassification[], maxPoints: number, max = 4): SparkPoint[] {
  const series = resample(
    songs.map((s) => s.mood),
    Math.max(1, maxPoints),
  );
  return series.map((value) => {
    const t = clamp(value / max, 0, 1);
    // Fallback is unreachable: t is clamped to [0, 1], so the rounded index always falls within SPARK_CHARS.
    const char = SPARK_CHARS[Math.round(t * (SPARK_CHARS.length - 1))] ?? "▁";
    return { char, color: moodGradientHex(t) };
  });
}

/** The mood gradient's own ramp, used as a "how to read this" key. */
export function moodScaleRamp(): SparkPoint[] {
  const steps = SPARK_CHARS.split("");
  return steps.map((char, i) => ({ char, color: moodGradientHex(i / (steps.length - 1)) }));
}

export interface Bar {
  filled: string;
  empty: string;
  color: string;
}

/** An eighth-block-precision bar (finer-grained than one-char-per-unit) for a 0..max value. */
export function moodBar(value: number, max: number, width: number): Bar {
  const t = clamp(value / max, 0, 1);
  const totalEighths = Math.round(t * width * 8);
  const fullBlocks = Math.min(width, Math.floor(totalEighths / 8));
  const remainder = totalEighths - fullBlocks * 8;

  let filled = "█".repeat(fullBlocks);
  if (fullBlocks < width && remainder > 0) filled += (EIGHTHS[remainder] ?? "");
  const empty = "░".repeat(Math.max(0, width - filled.length));

  return { filled, empty, color: moodGradientHex(t) };
}

export function complexityGlyph(value: number): string {
  const index = clamp(Math.round(value), 0, COMPLEXITY_GLYPHS.length - 1);
  // Fallback is unreachable: index is clamped into COMPLEXITY_GLYPHS' bounds above.
  return COMPLEXITY_GLYPHS[index] ?? "░";
}

export interface ThemeMixSegment {
  hex: string;
  width: number;
}

/** Proportional-width colored segments for the theme mix bar, drift-corrected so they always sum to exactly `barWidth`. */
export function themeMixSegments(themeDistribution: ThemeDistributionEntry[], totalSongs: number, barWidth: number): ThemeMixSegment[] {
  if (totalSongs === 0) return [];

  const segments = themeDistribution.map((entry) => ({
    hex: themeColor(entry.theme).hex,
    width: Math.max(1, Math.round((entry.count / totalSongs) * barWidth)),
  }));

  const drift = barWidth - segments.reduce((sum, s) => sum + s.width, 0);
  const first = segments[0];
  if (first) first.width = Math.max(1, first.width + drift);

  return segments;
}

export interface AlbumStripChar {
  char: string;
  color?: string;
  dim?: boolean;
}

/** A fixed-width strip of theme-colored blocks (one per song, "…" if truncated) for an album row. */
export function albumStrip(album: AlbumGroup, stripWidth: number): AlbumStripChar[] {
  const shown = album.songs.slice(0, stripWidth);
  const chars: AlbumStripChar[] = shown.map((s) => ({ char: "█", color: themeColor(s.theme).hex }));
  if (album.songs.length > stripWidth) {
    chars[chars.length - 1] = { char: "…", dim: true };
  }
  while (chars.length < stripWidth) chars.push({ char: "·", dim: true });
  return chars;
}

export function formatYear(date: string | undefined): string {
  return date ? date.slice(0, 4) : "????";
}
