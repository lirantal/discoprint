import { join } from "node:path";
import { searchArtist, getDiscography } from "./musicbrainz.js";
import { fetchLyrics } from "./lrclib.js";
import { classifySong } from "./jev.js";
import { readJsonCache, writeJsonCache, slugify } from "./util.js";
import type { LyricsResult, SongClassification, Track } from "./types.js";

const CACHE_DIR = join(process.cwd(), "data", "cache");
const OUTPUT_DIR = join(process.cwd(), "data", "output");

export interface RunOptions {
  limit?: number;
  includeNonAlbums?: boolean;
  force?: boolean;
}

export async function runPipeline(artistName: string, options: RunOptions = {}): Promise<void> {
  const artist = await searchArtist(artistName);
  const artistSlug = slugify(artist.name);
  console.log(`Resolved "${artistName}" -> ${artist.name}${artist.disambiguation ? ` (${artist.disambiguation})` : ""}`);

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
      classification = await classifySong({
        artist: artist.name,
        track: track.title,
        album: track.album,
        releaseDate: track.releaseDate,
        lyrics: lyrics.plainLyrics,
        lyricsSource: lyrics.source,
      });
      await writeJsonCache(classificationCachePath, classification);
    }

    console.log(`${progress} ${track.title} - theme=${classification.theme} mood=${classification.mood.toFixed(2)}`);
    results.push(classification);
  }

  await writeJsonCache(join(OUTPUT_DIR, `${artistSlug}.json`), results);
  await writeJsonCache(join(OUTPUT_DIR, `${artistSlug}-skipped.json`), skipped);

  console.log(`\nDone. Classified ${results.length}/${limited.length} tracks (${skipped.length} skipped, no lyrics).`);
  console.log(`Output: data/output/${artistSlug}.json`);
}
