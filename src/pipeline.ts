import { join } from "node:path";
import { searchArtist, getDiscography } from "./musicbrainz.js";
import { fetchLyrics } from "./lrclib.js";
import { classifySong, estimateCostUsd } from "./jev.js";
import { readJsonCache, writeJsonCache, slugify } from "./util.js";
import type { ClassificationRunMeta, LyricsResult, SongClassification, Track } from "./types.js";

const CACHE_DIR = join(process.cwd(), "data", "cache");
const OUTPUT_DIR = join(process.cwd(), "data", "output");

export interface RunOptions {
  limit?: number;
  includeNonAlbums?: boolean;
  force?: boolean;
}

export async function runPipeline(artistName: string, options: RunOptions = {}): Promise<void> {
  const pipelineStartedAt = Date.now();

  const artist = await searchArtist(artistName);
  const artistSlug = slugify(artist.name);
  console.log(
    `Resolved "${artistName}" -> ${artist.name}${artist.disambiguation ? ` (${artist.disambiguation})` : ""}`,
  );

  const discographyCachePath = join(CACHE_DIR, "musicbrainz", `${artistSlug}.json`);
  let tracks = await readJsonCache<Track[]>(discographyCachePath);
  if (!tracks || options.force) {
    console.log("Fetching discography from MusicBrainz (1 request/sec, this takes a while)...");
    tracks = await getDiscography(artist.id, { includeNonAlbums: options.includeNonAlbums });
    await writeJsonCache(discographyCachePath, tracks);
  }
  console.log(`Discography resolved: ${tracks.length} unique tracks.`);

  const limited = options.limit ? tracks.slice(0, options.limit) : tracks;
  const results: SongClassification[] = [];
  const skipped: Array<{ track: string; reason: string }> = [];

  let songsClassifiedThisRun = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let classifyDurationMs = 0;
  let lastModel: string | null = null;

  for (const [i, track] of limited.entries()) {
    const trackSlug = slugify(track.normalizedTitle);
    const progress = `[${i + 1}/${limited.length}]`;

    const lyricsCachePath = join(CACHE_DIR, "lyrics", artistSlug, `${trackSlug}.json`);
    let lyrics = await readJsonCache<LyricsResult>(lyricsCachePath);
    if (!lyrics) {
      lyrics = await fetchLyrics(artist.name, track.title);
      await writeJsonCache(lyricsCachePath, lyrics);
    }

    if (!lyrics.plainLyrics) {
      console.log(`${progress} ${track.title} - no lyrics found, skipping`);
      skipped.push({ track: track.title, reason: "no lyrics found" });
      continue;
    }

    const classificationCachePath = join(CACHE_DIR, "classification", artistSlug, `${trackSlug}.json`);
    let classification = await readJsonCache<SongClassification>(classificationCachePath);
    if (!classification || options.force) {
      const result = await classifySong({
        artist: artist.name,
        track: track.title,
        album: track.album,
        releaseDate: track.releaseDate,
        lyrics: lyrics.plainLyrics,
        lyricsSource: lyrics.source,
      });
      classification = result.classification;
      songsClassifiedThisRun += 1;
      inputTokens += result.usage.inputTokens;
      outputTokens += result.usage.outputTokens;
      classifyDurationMs += result.usage.durationMs;
      lastModel = result.usage.model;
      await writeJsonCache(classificationCachePath, classification);
    }

    console.log(`${progress} ${track.title} - theme=${classification.theme} mood=${classification.mood.toFixed(2)}`);
    results.push(classification);
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

  console.log(`\nDone. Classified ${results.length}/${limited.length} tracks (${skipped.length} skipped, no lyrics).`);
  if (songsClassifiedThisRun > 0) {
    console.log(
      `Jev usage this run: ${songsClassifiedThisRun} song(s), ${inputTokens} input / ${outputTokens} output tokens, ` +
        `~$${meta.estimatedCostUsd.toFixed(4)}, ${(classifyDurationMs / 1000).toFixed(1)}s.`,
    );
  }
  console.log(`Output: data/output/${artistSlug}.json`);
}
