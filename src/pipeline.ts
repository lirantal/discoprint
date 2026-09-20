import { join } from "node:path";
import { searchArtist, getDiscography } from "./musicbrainz.js";
import { fetchLyrics } from "./lrclib.js";
import { classifySong, estimateCostUsd } from "./jev.js";
import { readJsonCache, writeJsonCache, slugify } from "./util.js";
import type { PipelineEvent } from "./pipeline-events.js";
import type { ClassificationRunMeta, LyricsResult, SongClassification, Track } from "./types.js";

const CACHE_DIR = join(process.cwd(), "data", "cache");
const OUTPUT_DIR = join(process.cwd(), "data", "output");

// Jev has no documented per-key concurrency limit, but each systemOne call is
// already a single batched request (all 5 questions in one shot — see
// jev.ts), so the concurrency here is across *songs*, not within one. Kept
// modest since it's still one HTTP request per song, in flight at once.
const CLASSIFY_CONCURRENCY = Number(process.env.DISCOPRINT_CLASSIFY_CONCURRENCY ?? 5);

export interface RunOptions {
  limit?: number;
  includeNonAlbums?: boolean;
  force?: boolean;
  /**
   * Reports progress as it happens. runPipeline itself never prints or
   * touches the terminal — that's entirely up to whatever's on the other
   * end of this callback (a plain-text logger, an Ink app, or nothing).
   */
  onEvent?: (event: PipelineEvent) => void;
}

interface PendingClassification {
  id: string;
  track: Track;
  lyrics: string;
  lyricsSource: SongClassification["lyricsSource"];
  cachePath: string;
}

export async function runPipeline(artistName: string, options: RunOptions = {}): Promise<void> {
  const pipelineStartedAt = Date.now();
  const emit = (event: PipelineEvent): void => options.onEvent?.(event);

  emit({ type: "artist-resolving", query: artistName });
  const artist = await searchArtist(artistName);
  const artistSlug = slugify(artist.name);
  emit({ type: "artist-resolved", name: artist.name, disambiguation: artist.disambiguation });

  const discographyCachePath = join(CACHE_DIR, "musicbrainz", `${artistSlug}.json`);
  let tracks = await readJsonCache<Track[]>(discographyCachePath);
  if (!tracks || options.force) {
    emit({ type: "discography-fetching" });
    tracks = await getDiscography(artist.id, {
      includeNonAlbums: options.includeNonAlbums,
      onProgress: (done, total) => emit({ type: "discography-progress", done, total }),
    });
    await writeJsonCache(discographyCachePath, tracks);
  }
  emit({ type: "discography-resolved", trackCount: tracks.length });

  const limited = options.limit ? tracks.slice(0, options.limit) : tracks;
  const results: SongClassification[] = [];
  const skipped: Array<{ track: string; reason: string }> = [];
  const pending: PendingClassification[] = [];

  // Only emitted once a track actually needs a real fetch — if every lyric
  // is already cached, this phase produces no events at all.
  let lyricsFetchStarted = false;
  for (const [i, track] of limited.entries()) {
    const trackSlug = slugify(track.normalizedTitle);

    const lyricsCachePath = join(CACHE_DIR, "lyrics", artistSlug, `${trackSlug}.json`);
    let lyrics = await readJsonCache<LyricsResult>(lyricsCachePath);
    if (!lyrics) {
      if (!lyricsFetchStarted) {
        lyricsFetchStarted = true;
        emit({ type: "lyrics-fetch-started" });
      }
      lyrics = await fetchLyrics(artist.name, track.title);
      await writeJsonCache(lyricsCachePath, lyrics);
    }
    if (lyricsFetchStarted) {
      emit({ type: "lyrics-progress", done: i + 1, total: limited.length, track: track.title });
    }

    if (!lyrics.plainLyrics) {
      skipped.push({ track: track.title, reason: "no lyrics found" });
      continue;
    }

    const classificationCachePath = join(CACHE_DIR, "classification", artistSlug, `${trackSlug}.json`);
    const cached = options.force ? null : await readJsonCache<SongClassification>(classificationCachePath);
    if (cached) {
      results.push(cached);
    } else {
      pending.push({
        id: track.mbid,
        track,
        lyrics: lyrics.plainLyrics,
        lyricsSource: lyrics.source,
        cachePath: classificationCachePath,
      });
    }
  }
  if (lyricsFetchStarted) {
    emit({ type: "lyrics-ready", withLyrics: limited.length - skipped.length, total: limited.length });
  }

  let songsClassifiedThisRun = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let classifyDurationMs = 0;
  let lastModel: string | null = null;

  async function classifyOne(item: PendingClassification): Promise<void> {
    emit({ type: "classify-started", id: item.id });
    try {
      const result = await classifySong({
        artist: artist.name,
        track: item.track.title,
        album: item.track.album,
        releaseDate: item.track.releaseDate,
        lyrics: item.lyrics,
        lyricsSource: item.lyricsSource,
      });
      songsClassifiedThisRun += 1;
      inputTokens += result.usage.inputTokens;
      outputTokens += result.usage.outputTokens;
      lastModel = result.usage.model;
      await writeJsonCache(item.cachePath, result.classification);
      results.push(result.classification);
      emit({ type: "classify-completed", id: item.id, classification: result.classification, usage: result.usage });
    } catch (error) {
      emit({ type: "classify-failed", id: item.id, error });
      throw error;
    }
  }

  if (pending.length > 0) {
    emit({
      type: "classify-queued",
      songs: pending.map((item) => ({
        id: item.id,
        title: item.track.title,
        album: item.track.album,
        releaseDate: item.track.releaseDate,
      })),
    });

    // Since lyrics are already on disk, classifying each song is an
    // independent single Jev call — run several in flight at once instead of
    // one at a time.
    const classifyPhaseStartedAt = Date.now();
    let nextIndex = 0;
    let firstError: unknown;
    let stopRequested = false;

    async function worker(): Promise<void> {
      for (;;) {
        if (stopRequested) return;
        const item = pending[nextIndex++];
        if (!item) return;

        try {
          await classifyOne(item);
        } catch (error) {
          // Let every other in-flight worker wind down cleanly (rather than
          // leaving unhandled rejections behind) before we rethrow below.
          firstError ??= error;
          stopRequested = true;
          return;
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CLASSIFY_CONCURRENCY, pending.length) }, worker));
    // Wall-clock, not a sum of the individual calls: several run concurrently,
    // so summing their durations would overstate how long this phase actually took.
    classifyDurationMs = Date.now() - classifyPhaseStartedAt;

    if (firstError) throw firstError;
  }

  const meta: ClassificationRunMeta = {
    artist: artist.name,
    generatedAt: new Date().toISOString(),
    model: lastModel,
    songsClassifiedThisRun,
    totalSongsInOutput: results.length,
    tokens: { input: inputTokens, output: outputTokens },
    estimatedCostUsd: estimateCostUsd(inputTokens),
    durationMs: {
      classification: classifyDurationMs,
      total: Date.now() - pipelineStartedAt,
    },
  };

  await writeJsonCache(join(OUTPUT_DIR, `${artistSlug}.json`), results);
  await writeJsonCache(join(OUTPUT_DIR, `${artistSlug}-skipped.json`), skipped);
  await writeJsonCache(join(OUTPUT_DIR, `${artistSlug}-meta.json`), meta);

  emit({ type: "run-completed", meta, skippedCount: skipped.length, totalConsidered: limited.length });
}
