import { bold, clamp, colorsEnabled, dim, fg, moodGradientHex } from "./colors.js";
import { resample, type AlbumGroup, type VisualizationData } from "./data.js";
import { themeColor } from "./theme-palette.js";
import type { SongClassification } from "../types.js";

export interface TerminalRenderOptions {
  /** Terminal columns. Defaults to process.stdout.columns, then 80. */
  width?: number;
  /** Terminal rows, used to decide per-song vs. per-album detail. Defaults to process.stdout.rows, then 24. */
  height?: number;
  colorEnabled?: boolean;
}

const SPARK_CHARS = " ▁▂▃▄▅▆▇█";
const EIGHTHS = " ▏▎▍▌▋▊▉█";
const COMPLEXITY_GLYPHS = ["░", "▒", "▓", "█"];
const MOOD_MAX = 4;
const COMPLEXITY_MAX = 3;
const MOOD_BAR_WIDTH = 6;

/** Renders a shaped VisualizationData into printable lines. Pure — no I/O, no process.stdout access. */
export function renderTerminal(data: VisualizationData, options: TerminalRenderOptions = {}): string[] {
  const width = Math.max(40, options.width ?? process.stdout.columns ?? 80);
  const height = Math.max(10, options.height ?? process.stdout.rows ?? 24);
  const colorEnabled = options.colorEnabled ?? colorsEnabled();

  const lines: string[] = [];
  lines.push(renderHeader(data, colorEnabled));
  lines.push("");
  lines.push(renderMoodArc(data, width, colorEnabled));
  lines.push("");
  lines.push(...renderLegend(data, width, colorEnabled));
  const distributionBar = renderThemeDistributionBar(data, width, colorEnabled);
  if (distributionBar) lines.push(distributionBar);
  lines.push("");

  const reserved = lines.length + 3;
  const availableRows = Math.max(3, height - reserved);

  if (data.songs.length === 0) {
    lines.push(dim("No classified songs yet.", colorEnabled));
  } else if (data.songs.length <= availableRows) {
    for (const song of data.songs) lines.push(renderSongRow(song, width, colorEnabled));
  } else {
    for (const album of data.albums) lines.push(renderAlbumRow(album, width, colorEnabled));
  }

  return lines;
}

function year(date: string | undefined): string {
  return date ? date.slice(0, 4) : "????";
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text.padEnd(maxLength);
  return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

function renderHeader(data: VisualizationData, colorEnabled: boolean): string {
  const parts = [`${data.songs.length} songs classified`];
  if (data.skippedCount > 0) parts.push(`${data.skippedCount} skipped`);
  const { from, to } = data.dateRange;
  if (from) parts.push(from === to ? year(from) : `${year(from)}–${year(to)}`);

  return `${fg("◆", "#22d3ee", colorEnabled)}  ${bold(data.artist, colorEnabled)}  ${dim(`— ${parts.join(" · ")}`, colorEnabled)}`;
}

function renderMoodArc(data: VisualizationData, width: number, colorEnabled: boolean): string {
  const label = "mood arc  ";
  if (data.songs.length === 0) return dim(`${label}(no data)`, colorEnabled);

  const series = resample(
    data.songs.map((s) => s.mood),
    Math.max(1, width - label.length),
  );

  const arc = series
    .map((value) => {
      const t = clamp(value / MOOD_MAX, 0, 1);
      const char = SPARK_CHARS[Math.round(t * (SPARK_CHARS.length - 1))];
      return fg(char, moodGradientHex(t), colorEnabled);
    })
    .join("");

  return `${dim(label, colorEnabled)}${arc}`;
}

function renderLegend(data: VisualizationData, width: number, colorEnabled: boolean): string[] {
  if (data.themeDistribution.length === 0) return [];

  const chips = data.themeDistribution.map(({ theme }) => {
    const { hex, label } = themeColor(theme);
    return `${fg("██", hex, colorEnabled)} ${dim(label, colorEnabled)}`;
  });

  const lines: string[] = [];
  let current = "";
  for (const chip of chips) {
    const candidate = current ? `${current}   ${chip}` : chip;
    if (visibleLength(candidate) > width && current) {
      lines.push(current);
      current = chip;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function renderThemeDistributionBar(data: VisualizationData, width: number, colorEnabled: boolean): string {
  const total = data.songs.length;
  if (total === 0) return "";

  const barWidth = Math.min(50, Math.max(10, width - 14));
  const segments = data.themeDistribution.map((entry) => ({
    hex: themeColor(entry.theme).hex,
    width: Math.max(1, Math.round((entry.count / total) * barWidth)),
  }));

  // Rounding can drift the total off by a few chars; absorb the difference in the largest segment.
  const drift = barWidth - segments.reduce((sum, s) => sum + s.width, 0);
  if (segments.length > 0) segments[0].width = Math.max(1, segments[0].width + drift);

  const bar = segments.map((s) => fg("█".repeat(s.width), s.hex, colorEnabled)).join("");
  return `${dim("theme mix ", colorEnabled)}${bar}`;
}

function renderBar(value: number, max: number, width: number, colorHex: string, colorEnabled: boolean): string {
  const t = clamp(value / max, 0, 1);
  const totalEighths = Math.round(t * width * 8);
  const fullBlocks = Math.min(width, Math.floor(totalEighths / 8));
  const remainder = totalEighths - fullBlocks * 8;

  let filled = "█".repeat(fullBlocks);
  if (fullBlocks < width && remainder > 0) filled += EIGHTHS[remainder];
  const empty = "░".repeat(Math.max(0, width - visibleLength(filled)));

  return `${fg(filled, colorHex, colorEnabled)}${dim(empty, colorEnabled)}`;
}

function complexityGlyph(value: number, colorEnabled: boolean): string {
  const index = clamp(Math.round(value), 0, COMPLEXITY_GLYPHS.length - 1);
  return dim(COMPLEXITY_GLYPHS[index], colorEnabled);
}

function renderSongRow(song: SongClassification, width: number, colorEnabled: boolean): string {
  const { hex } = themeColor(song.theme);
  const swatch = fg("██", hex, colorEnabled);
  const yearLabel = dim(year(song.releaseDate), colorEnabled);
  const moodBar = renderBar(song.mood, MOOD_MAX, MOOD_BAR_WIDTH, moodGradientHex(song.mood / MOOD_MAX), colorEnabled);
  const cplx = complexityGlyph(song.complexity, colorEnabled);

  const fixedWidth = 2 + 1 + 4 + 1 + MOOD_BAR_WIDTH + 1 + 1 + 2; // swatch, gap, year, gap, bar, gap, cplx, gaps
  const titleWidth = Math.max(10, width - fixedWidth);
  const title = truncate(song.track, titleWidth);

  return `${swatch} ${yearLabel} ${title} ${moodBar} ${cplx}`;
}

const ALBUM_STRIP_WIDTH = 20;

function renderAlbumRow(album: AlbumGroup, width: number, colorEnabled: boolean): string {
  const yearLabel = dim(year(album.releaseDate), colorEnabled);
  const moodBar = renderBar(album.avgMood, MOOD_MAX, MOOD_BAR_WIDTH, moodGradientHex(album.avgMood / MOOD_MAX), colorEnabled);
  const cplx = complexityGlyph(album.avgComplexity, colorEnabled);
  // Right-pad to keep this trailing column aligned across rows for typical (<100 track) albums.
  const countLabel = dim(`(${String(album.songs.length).padStart(2)})`, colorEnabled);

  // A fixed-width strip (padded/truncated) keeps every row's columns aligned
  // regardless of how many songs are in each album.
  const shown = album.songs.slice(0, ALBUM_STRIP_WIDTH);
  const stripChars = shown.map((s) => fg("█", themeColor(s.theme).hex, colorEnabled));
  if (album.songs.length > ALBUM_STRIP_WIDTH) {
    stripChars[stripChars.length - 1] = dim("…", colorEnabled);
  }
  while (stripChars.length < ALBUM_STRIP_WIDTH) stripChars.push(dim("·", colorEnabled));
  const strip = stripChars.join("");

  const fixedWidth = 4 + 1 + ALBUM_STRIP_WIDTH + 1 + MOOD_BAR_WIDTH + 1 + 1 + 1 + 6; // year, strip, bar, cplx, count, gaps
  const titleWidth = Math.max(10, width - fixedWidth - 1);
  const title = truncate(album.album, titleWidth);

  return `${yearLabel} ${title} ${strip} ${moodBar} ${cplx} ${countLabel}`;
}

/** Length ignoring ANSI escape sequences — needed to wrap/pad colored strings correctly. */
function visibleLength(text: string): number {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\[[0-9;]*m/g, "").length;
}
