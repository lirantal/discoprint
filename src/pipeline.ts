import { join } from "node:path";
import { searchArtist, getDiscography } from "./musicbrainz.js";
import { fetchLyrics } from "./lrclib.js";
import { classifySong, estimateCostUsd } from "./jev.js";
import { readJsonCache, writeJsonCache, slugify } from "./util.js";
import { canAnimate, startSpinner, startTaskList, type Spinner, type TaskList } from "./spinner.js";
import { colorsEnabled, fg } from "./viz/colors.js";
import { themeColor } from "./viz/theme-palette.js";
import type { ClassificationRunMeta, LyricsResult, SongClassification, Track } from "./types.js";

const CACHE_DIR = join(process.cwd(), "data", "cache");
const OUTPUT_DIR = join(process.cwd(), "data", "output");

// Jev has no documented per-key concurrency limit, but each systemOne call is
// already a single batched request (all 5 questions in one shot — see
// jev.ts), so the concurrency here is across *songs*, not within one. Kept
// modest since it's still one HTTP request per song, in flight at once.
const CLASSIFY_CONCURRENCY = Number(process.env.DISCOPRINT_CLASSIFY_CONCURRENCY ?? 5);
// Above this many songs, a live per-song checklist stops being readable (and
// risks overflowing the terminal's scrollback in ways that break the
// cursor-position math) — fall back to a single aggregate spinner instead.
const MAX_ANIMATED_ROWS = 20;

export interface RunOptions {
  limit?: number;
  includeNonAlbums?: boolean;
  force?: boolean;
  /** Print per-step progress (artist resolution, discography fetch, one line per song) instead of live spinners/summary. */
  verbose?: boolean;
}

interface PendingClassification {
  track: Track;
  lyrics: string;
  lyricsSource: SongClassification["lyricsSource"];
  cachePath: string;
}

export async function runPipeline(artistName: string, options: RunOptions = {}): Promise<void> {
  const pipelineStartedAt = Date.now();
  const verbose = options.verbose ?? false;
  const animate = !verbose && canAnimate();
  const log = (message: string): void => {
    if (verbose) console.log(message);
  };

  const artistSpinner = animate ? startSpinner("Resolving artist…") : undefined;
  let artist: Awaited<ReturnType<typeof searchArtist>>;
  try {
    artist = await searchArtist(artistName);
  } catch (err) {
    artistSpinner?.stop(`✖ Could not resolve "${artistName}".`);
    throw err;
  }
  const artistSlug = slugify(artist.name);
  const artistLine = `Resolved "${artistName}" -> ${artist.name}${artist.disambiguation ? ` (${artist.disambiguation})` : ""}`;
  artistSpinner?.stop(`✔ ${artistLine}`);
  log(artistLine);

  const discographyCachePath = join(CACHE_DIR, "musicbrainz", `${artistSlug}.json`);
  let tracks = await readJsonCache<Track[]>(discographyCachePath);
  if (!tracks || options.force) {
    const discoSpinner = animate ? startSpinner("Fetching discography from MusicBrainz…") : undefined;
    log("Fetching discography from MusicBrainz (1 request/sec, this takes a while)...");
    try {
      tracks = await getDiscography(artist.id, {
        includeNonAlbums: options.includeNonAlbums,
        onProgress: (done, total) => {
          discoSpinner?.update(`Fetching discography from MusicBrainz… (${done}/${total} releases)`);
        },
      });
    } catch (err) {
      discoSpinner?.stop("✖ Failed to fetch discography.");
      throw err;
    }
    discoSpinner?.stop(`✔ Discography resolved: ${tracks.length} unique tracks.`);
    await writeJsonCache(discographyCachePath, tracks);
  }
  log(`Discography resolved: ${tracks.length} unique tracks.`);

  const limited = options.limit ? tracks.slice(0, options.limit) : tracks;
  const results: SongClassification[] = [];
  const skipped: Array<{ track: string; reason: string }> = [];
  const pending: PendingClassification[] = [];

  // Lazily started: if every track's lyrics are already cached, nothing is
  // actually fetched, so there's nothing worth animating either.
  let lyricsSpinner: Spinner | undefined;
  try {
    for (const [i, track] of limited.entries()) {
      const trackSlug = slugify(track.normalizedTitle);
      const progress = `[${i + 1}/${limited.length}]`;

      const lyricsCachePath = join(CACHE_DIR, "lyrics", artistSlug, `${trackSlug}.json`);
      let lyrics = await readJsonCache<LyricsResult>(lyricsCachePath);
      if (!lyrics) {
        lyricsSpinner ??= animate ? startSpinner(`Fetching lyrics… (${i + 1}/${limited.length})`) : undefined;
        lyrics = await fetchLyrics(artist.name, track.title);
        await writeJsonCache(lyricsCachePath, lyrics);
      }
      lyricsSpinner?.update(`Fetching lyrics… (${i + 1}/${limited.length}) ${track.title}`);

      if (!lyrics.plainLyrics) {
        log(`${progress} ${track.title} - no lyrics found, skipping`);
        skipped.push({ track: track.title, reason: "no lyrics found" });
        continue;
      }

      const classificationCachePath = join(CACHE_DIR, "classification", artistSlug, `${trackSlug}.json`);
      const cached = options.force ? null : await readJsonCache<SongClassification>(classificationCachePath);
      if (cached) {
        results.push(cached);
      } else {
        pending.push({
          track,
          lyrics: lyrics.plainLyrics,
          lyricsSource: lyrics.source,
          cachePath: classificationCachePath,
        });
      }
    }
  } catch (err) {
    lyricsSpinner?.stop("✖ Failed while fetching lyrics.");
    throw err;
  }
  lyricsSpinner?.stop(`✔ Lyrics ready — ${limited.length - skipped.length}/${limited.length} tracks have lyrics.`);

  let songsClassifiedThisRun = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let classifyDurationMs = 0;
  let lastModel: string | null = null;

  async function classifyOne(item: PendingClassification): Promise<SongClassification> {
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
    return result.classification;
  }

  if (pending.length > 0) {
    // Since lyrics are already on disk, classifying each song is an
    // independent single Jev call — run several in flight at once instead of
    // one at a time.
    const classifyPhaseStartedAt = Date.now();
    const useTaskList = animate && pending.length <= MAX_ANIMATED_ROWS;
    const colorEnabled = colorsEnabled();

    const taskList: TaskList | undefined = useTaskList
      ? startTaskList(pending.map((item, i) => ({ id: String(i), label: item.track.title })))
      : undefined;
    const classifySpinner: Spinner | undefined =
      animate && !useTaskList ? startSpinner(`Classifying songs… (0/${pending.length})`) : undefined;

    let doneCount = 0;
    let nextIndex = 0;
    let firstError: unknown;
    let stopRequested = false;

    async function worker(): Promise<void> {
      for (;;) {
        if (stopRequested) return;
        const i = nextIndex++;
        const item = pending[i];
        if (!item) return;

        try {
          const classification = await classifyOne(item);
          doneCount += 1;
          results.push(classification);

          if (taskList) {
            const { hex, label } = themeColor(classification.theme);
            taskList.complete(
              String(i),
              `${fg("██", hex, colorEnabled)} ${item.track.title} — ${label}, mood ${classification.mood.toFixed(1)}`,
            );
          } else if (classifySpinner) {
            classifySpinner.update(`Classifying songs… (${doneCount}/${pending.length})`);
          } else {
            log(
              `[classify ${doneCount}/${pending.length}] ${item.track.title} - theme=${classification.theme} mood=${classification.mood.toFixed(2)}`,
            );
          }
        } catch (err) {
          // Let every other in-flight worker wind down cleanly (rather than
          // leaving unhandled rejections behind) before we rethrow below.
          firstError ??= err;
          stopRequested = true;
          return;
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CLASSIFY_CONCURRENCY, pending.length) }, worker));
    // Wall-clock, not a sum of the individual calls: several run concurrently,
    // so summing their durations would overstate how long this phase actually took.
    classifyDurationMs = Date.now() - classifyPhaseStartedAt;

    if (firstError) {
      taskList?.stop("✖ Classification failed.");
      classifySpinner?.stop("✖ Classification failed.");
      throw firstError;
    }
    // Collapsed to one line either way: the per-song lines (task list) or the
    // running count (spinner) were only useful while classification was
    // still in flight — left on screen afterward, they'd just duplicate the
    // dashboard's own per-song breakdown a moment later, out of order (songs
    // finish in completion order here, not chronological).
    const doneLine = `✔ Classified ${pending.length} song${pending.length === 1 ? "" : "s"}.`;
    taskList?.stop(doneLine);
    classifySpinner?.stop(doneLine);
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

  log(`\nDone. Classified ${results.length}/${limited.length} tracks (${skipped.length} skipped, no lyrics).`);
  if (songsClassifiedThisRun > 0) {
    log(
      `Jev usage this run: ${songsClassifiedThisRun} song(s), ${inputTokens} input / ${outputTokens} output tokens, ` +
        `~$${meta.estimatedCostUsd.toFixed(4)}, ${(classifyDurationMs / 1000).toFixed(1)}s.`,
    );
  }
  log(`Output: data/output/${artistSlug}.json`);
}
