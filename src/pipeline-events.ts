import type { ClassificationRunMeta, JevUsage, SongClassification } from "./types.js";

/** A song queued for classification once its lyrics are on disk — the identity a UI needs before any classification exists yet. */
export interface QueuedSong {
  id: string;
  title: string;
  album: string;
  releaseDate?: string;
}

/**
 * Everything runPipeline reports about its own progress, as plain data — no
 * console/terminal/Ink dependency here. Callers decide how (or whether) to
 * render these: src/bin/cli.ts wires them into a plain-text logger, an Ink
 * app, or nothing at all, depending on --verbose/TTY/CI.
 */
export type PipelineEvent =
  | { type: "artist-resolving"; query: string }
  | { type: "artist-resolved"; name: string; disambiguation?: string }
  | { type: "discography-fetching" }
  | { type: "discography-progress"; done: number; total: number }
  | { type: "discography-resolved"; trackCount: number }
  | { type: "lyrics-fetch-started" }
  | { type: "lyrics-progress"; done: number; total: number; track: string }
  | { type: "lyrics-ready"; withLyrics: number; total: number }
  | { type: "classify-queued"; songs: QueuedSong[] }
  | { type: "classify-started"; id: string }
  | { type: "classify-completed"; id: string; classification: SongClassification; usage: JevUsage }
  | { type: "classify-failed"; id: string; error: unknown }
  | { type: "run-completed"; meta: ClassificationRunMeta; skippedCount: number; totalConsidered: number };
