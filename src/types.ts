export interface Track {
  /** MusicBrainz recording id */
  mbid: string;
  title: string;
  normalizedTitle: string;
  album: string;
  releaseDate?: string;
}

export interface LyricsResult {
  plainLyrics: string | null;
  source: "lrclib-get" | "lrclib-search" | "none";
}

export interface SongClassification {
  artist: string;
  track: string;
  album: string;
  releaseDate?: string;
  lyricsSource: LyricsResult["source"];
  theme: string;
  themeConfidence: number;
  mood: number;
  moodConfidence: number;
  complexity: number;
  complexityConfidence: number;
  explicit: number;
  firstPerson: number;
}

/** Token usage and timing for a single `systemOne` call. */
export interface JevUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

/**
 * Aggregate stats for one `runPipeline` invocation, written alongside the
 * classification output as `<artist-slug>-meta.json`. Reflects only the new
 * Jev calls this run actually made — cache hits contribute nothing, since no
 * API call happened for them. Overwritten on every run, so it always
 * describes the most recent invocation, not a running lifetime total.
 */
export interface ClassificationRunMeta {
  artist: string;
  generatedAt: string;
  /** null when every song this run was served from cache (no Jev calls made). */
  model: string | null;
  songsClassifiedThisRun: number;
  totalSongsInOutput: number;
  tokens: { input: number; output: number };
  estimatedCostUsd: number;
  durationMs: {
    /** Sum of per-call Jev durations (excludes MusicBrainz/lrclib/cache I/O time). */
    classification: number;
    /** Wall time for the whole runPipeline call. */
    total: number;
  };
}
