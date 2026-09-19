import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { KnownError } from "../errors.js";
import type { SongClassification } from "../types.js";

export interface AlbumGroup {
  album: string;
  releaseDate?: string;
  songs: SongClassification[];
  avgMood: number;
  avgComplexity: number;
}

export interface ThemeDistributionEntry {
  theme: string;
  count: number;
  percentage: number;
}

/**
 * Renderer-agnostic shape of "everything there is to show" for one artist.
 * A future HTML/SVG renderer should consume this same shape, produced once
 * here, rather than re-deriving it from raw SongClassification[] itself.
 */
export interface VisualizationData {
  artist: string;
  /** Chronological order (by releaseDate). */
  songs: SongClassification[];
  /** Chronological order (by each album's releaseDate). */
  albums: AlbumGroup[];
  /** Sorted by count, descending. */
  themeDistribution: ThemeDistributionEntry[];
  skippedCount: number;
  dateRange: { from?: string; to?: string };
}

export function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Buckets `values` into exactly `targetLength` averaged points; a no-op if already short enough. */
export function resample(values: number[], targetLength: number): number[] {
  if (targetLength <= 0 || values.length <= targetLength) return values;

  const bucketSize = values.length / targetLength;
  const result: number[] = [];
  for (let i = 0; i < targetLength; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    result.push(average(values.slice(start, end)));
  }
  return result;
}

/** Pure data-shaping: sorting, grouping, aggregating. No I/O — fully unit-testable. */
export function buildVisualizationData(
  artist: string,
  songs: SongClassification[],
  skippedCount: number,
): VisualizationData {
  const sorted = [...songs].sort((a, b) => (a.releaseDate ?? "9999").localeCompare(b.releaseDate ?? "9999"));

  const albums: AlbumGroup[] = [];
  const albumsByName = new Map<string, AlbumGroup>();
  for (const song of sorted) {
    let group = albumsByName.get(song.album);
    if (!group) {
      group = { album: song.album, releaseDate: song.releaseDate, songs: [], avgMood: 0, avgComplexity: 0 };
      albumsByName.set(song.album, group);
      albums.push(group);
    }
    group.songs.push(song);
  }
  for (const group of albums) {
    group.avgMood = average(group.songs.map((s) => s.mood));
    group.avgComplexity = average(group.songs.map((s) => s.complexity));
  }

  const themeCounts = new Map<string, number>();
  for (const song of sorted) {
    themeCounts.set(song.theme, (themeCounts.get(song.theme) ?? 0) + 1);
  }
  const themeDistribution: ThemeDistributionEntry[] = [...themeCounts.entries()]
    .map(([theme, count]) => ({ theme, count, percentage: sorted.length === 0 ? 0 : (count / sorted.length) * 100 }))
    .sort((a, b) => b.count - a.count);

  const dates = sorted.map((s) => s.releaseDate).filter((d): d is string => Boolean(d));

  return {
    artist,
    songs: sorted,
    albums,
    themeDistribution,
    skippedCount,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
  };
}

export async function loadVisualizationData(
  outputDir: string,
  artistSlug: string,
  artist: string,
): Promise<VisualizationData> {
  const outputPath = join(outputDir, `${artistSlug}.json`);
  let songs: SongClassification[];
  try {
    songs = JSON.parse(await readFile(outputPath, "utf-8")) as SongClassification[];
  } catch (cause) {
    throw new KnownError(
      `No classification data found at ${outputPath}. Run \`npm run classify -- "${artist}"\` first.`,
      { cause },
    );
  }

  let skippedCount = 0;
  try {
    const skipped = JSON.parse(await readFile(join(outputDir, `${artistSlug}-skipped.json`), "utf-8")) as unknown[];
    skippedCount = skipped.length;
  } catch {
    // No skipped-tracks file, or it's unreadable — not fatal, just show 0.
  }

  return buildVisualizationData(artist, songs, skippedCount);
}
