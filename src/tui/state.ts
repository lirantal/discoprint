// Pure state machine driving the live classify UI. Deliberately has no
// dependency on Ink or React — PipelineEvent in, AppState out — so it's
// trivial to unit test (see state.test.ts) and reusable by any renderer.
import { describeError } from "../errors.js";
import type { PipelineEvent, QueuedSong } from "../pipeline-events.js";
import type { ClassificationRunMeta } from "../types.js";
import type { CompletedSong } from "./types.js";

export type Phase = "resolving-artist" | "fetching-discography" | "fetching-lyrics" | "classifying" | "done" | "error";

export interface AppState {
  phase: Phase;
  artistQuery: string;
  artistName?: string;
  disambiguation?: string;
  discographyProgress?: { done: number; total: number };
  discographyTrackCount?: number;
  lyricsProgress?: { done: number; total: number; track: string };
  /** Cleared as soon as anything other than another retry happens — it's only meaningful while the retried operation is still pending. */
  retryNotice?: { attempt: number; maxRetries: number; delayMs: number };
  totalToClassify: number;
  queuedById: Map<string, QueuedSong>;
  inFlight: Map<string, string>;
  log: CompletedSong[];
  runningTokens: { input: number; output: number };
  runningCount: number;
  skippedCount?: number;
  meta?: ClassificationRunMeta;
  errorMessage?: string;
}

export function initialState(artistQuery: string): AppState {
  return {
    phase: "resolving-artist",
    artistQuery,
    totalToClassify: 0,
    queuedById: new Map(),
    inFlight: new Map(),
    log: [],
    runningTokens: { input: 0, output: 0 },
    runningCount: 0,
  };
}

export function reduce(state: AppState, event: PipelineEvent): AppState {
  // Retries are only meaningful while the operation they belong to is still
  // pending — any other event means we've moved past whatever was retrying.
  if (event.type !== "musicbrainz-retry" && state.retryNotice) {
    state = { ...state, retryNotice: undefined };
  }

  switch (event.type) {
    case "artist-resolving":
      return { ...state, phase: "resolving-artist" };

    case "musicbrainz-retry":
      return { ...state, retryNotice: { attempt: event.attempt, maxRetries: event.maxRetries, delayMs: event.delayMs } };

    case "artist-resolved":
      return { ...state, artistName: event.name, disambiguation: event.disambiguation };

    case "discography-fetching":
      return { ...state, phase: "fetching-discography" };

    case "discography-progress":
      return { ...state, discographyProgress: { done: event.done, total: event.total } };

    case "discography-resolved":
      return { ...state, discographyTrackCount: event.trackCount };

    case "lyrics-fetch-started":
      return { ...state, phase: "fetching-lyrics" };

    case "lyrics-progress":
      return { ...state, lyricsProgress: { done: event.done, total: event.total, track: event.track } };

    case "lyrics-ready":
      return state;

    case "classify-queued":
      return {
        ...state,
        phase: "classifying",
        totalToClassify: event.songs.length,
        queuedById: new Map(event.songs.map((song) => [song.id, song])),
      };

    case "classify-started": {
      const title = state.queuedById.get(event.id)?.title ?? event.id;
      return { ...state, inFlight: new Map(state.inFlight).set(event.id, title) };
    }

    case "classify-completed": {
      const inFlight = new Map(state.inFlight);
      inFlight.delete(event.id);
      const queued = state.queuedById.get(event.id);
      const completed: CompletedSong = {
        id: event.id,
        title: queued?.title ?? event.id,
        album: queued?.album ?? "",
        releaseDate: queued?.releaseDate,
        classification: event.classification,
        usage: event.usage,
      };
      return {
        ...state,
        inFlight,
        log: [...state.log, completed],
        runningCount: state.runningCount + 1,
        runningTokens: {
          input: state.runningTokens.input + event.usage.inputTokens,
          output: state.runningTokens.output + event.usage.outputTokens,
        },
      };
    }

    case "classify-failed": {
      const inFlight = new Map(state.inFlight);
      inFlight.delete(event.id);
      return {
        ...state,
        inFlight,
        phase: "error",
        errorMessage: describeError(event.error).message,
      };
    }

    case "run-completed":
      return { ...state, phase: "done", meta: event.meta, skippedCount: event.skippedCount };

    case "run-failed":
      return { ...state, phase: "error", errorMessage: describeError(event.error).message };

    default:
      return state;
  }
}
