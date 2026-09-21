// Pure data-shaping for the "discography grid" — a GitHub-contributions-style
// box grid, one cell per classified song in chronological order, colored by
// theme — plus the handful of summary stats shown alongside it. Shared by
// both renderers (render-terminal.ts's plain text and the Ink dashboard's
// DiscographyPanel.tsx) so the two never drift on what a cell means or which
// stats are shown, only on how they're drawn.
import { average, type VisualizationData } from "./data.js";
import { themeColor } from "./theme-palette.js";
import type { SongClassification } from "../types.js";

export interface DiscographyStat {
  label: string;
  value: string;
}

// Caps the grid's vertical footprint for a very large discography (e.g. a
// 300+ song back catalog) — past this many rows we stop rather than push the
// rest of the dashboard off-screen; hiddenSongCount() reports what got cut.
const MAX_GRID_ROWS = 20;
const MIN_COLUMNS = 8;
// A swatch cell ("██" + a 1-char gap) — shared by gridColumns() and
// discographyPanelRowCount() so the row-count estimate a caller reserves
// space for can never drift from what the grid actually renders.
export const GRID_CELL_WIDTH = 3;

/** Six at-a-glance numbers about the whole discography — the grid's "stat cards". */
export function computeDiscographyStats(data: VisualizationData): DiscographyStat[] {
  if (data.songs.length === 0) return [];

  const { from, to } = data.dateRange;
  const fromYear = from?.slice(0, 4);
  const toYear = to?.slice(0, 4);
  const years = fromYear ? (fromYear === toYear ? fromYear : `${fromYear}–${toYear}`) : "—";

  const topTheme = data.themeDistribution[0];
  const topThemeValue = topTheme ? `${themeColor(topTheme.theme).label} ${Math.round(topTheme.percentage)}%` : "—";

  const avgMood = average(data.songs.map((s) => s.mood));

  const busiestAlbum = data.albums.reduce<VisualizationData["albums"][number] | undefined>(
    (best, album) => (!best || album.songs.length > best.songs.length ? album : best),
    undefined,
  );

  return [
    { label: "songs", value: String(data.songs.length) },
    { label: "albums", value: String(data.albums.length) },
    { label: "years active", value: years },
    { label: "top theme", value: topThemeValue },
    { label: "avg mood", value: `${avgMood.toFixed(1)} / 4` },
    { label: "busiest album", value: busiestAlbum ? `${busiestAlbum.album} (${busiestAlbum.songs.length})` : "—" },
  ];
}

/** How many song cells fit per row (each cell is `cellWidth` chars, swatch + gap) for the available width. */
export function gridColumns(width: number, cellWidth = 3): number {
  return Math.max(MIN_COLUMNS, Math.floor(width / cellWidth));
}

/** Chunks songs into fixed-width rows, chronological order preserved, capped at MAX_GRID_ROWS. */
export function gridRows(songs: SongClassification[], columns: number): SongClassification[][] {
  const rows: SongClassification[][] = [];
  for (let i = 0; i < songs.length; i += columns) {
    rows.push(songs.slice(i, i + columns));
  }
  return rows.slice(0, MAX_GRID_ROWS);
}

/** How many trailing songs got cut off by the MAX_GRID_ROWS cap, if any. */
export function hiddenSongCount(songCount: number, columns: number): number {
  const totalRows = Math.ceil(songCount / columns);
  return totalRows <= MAX_GRID_ROWS ? 0 : songCount - MAX_GRID_ROWS * columns;
}

/** Row count the grid will actually render — what callers reserve vertical space for. */
export function gridRowCount(songCount: number, columns: number): number {
  return Math.min(MAX_GRID_ROWS, Math.ceil(songCount / columns));
}

// border(2) + title(1) + margin above stats(1) + stats line (may wrap to 2)
// + margin above grid(1) + grid label(1) + blank line before the grid
// itself(1) — everything in the panel besides the grid rows themselves.
const PANEL_CHROME_ROWS = 2 + 1 + 1 + 2 + 1 + 1 + 1;

/** Total row height the whole DiscographyPanel/its plain-text equivalent will take, given the panel's inner content width — for callers that need to reserve vertical space for it up front (see Dashboard.tsx's RESERVED_ROWS). */
export function discographyPanelRowCount(songCount: number, contentWidth: number): number {
  if (songCount === 0) return 0;
  const columns = gridColumns(contentWidth, GRID_CELL_WIDTH);
  return PANEL_CHROME_ROWS + gridRowCount(songCount, columns);
}
