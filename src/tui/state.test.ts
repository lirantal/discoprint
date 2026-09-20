import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, reduce } from "./state.js";
import type { SongClassification } from "../types.js";

function classification(overrides: Partial<SongClassification> = {}): SongClassification {
  return {
    artist: "Test Artist",
    track: "Track",
    album: "Album",
    releaseDate: "2000-01-01",
    lyricsSource: "lrclib-get",
    theme: "love",
    themeConfidence: 0.9,
    mood: 2,
    moodConfidence: 0.8,
    complexity: 1,
    complexityConfidence: 0.7,
    explicit: 0.1,
    firstPerson: 0.5,
    ...overrides,
  };
}

test("initialState", () => {
  const state = initialState("Bon Jovi");
  assert.equal(state.phase, "resolving-artist");
  assert.equal(state.artistQuery, "Bon Jovi");
  assert.equal(state.log.length, 0);
  assert.equal(state.inFlight.size, 0);
});

test("reduce", async (t) => {
  await t.test("artist-resolved fills in the resolved name and disambiguation", () => {
    const state = reduce(initialState("bon jovi"), {
      type: "artist-resolved",
      name: "Bon Jovi",
      disambiguation: "American rock band",
    });
    assert.equal(state.artistName, "Bon Jovi");
    assert.equal(state.disambiguation, "American rock band");
  });

  await t.test("discography-fetching/progress/resolved advance the phase and progress", () => {
    let state = reduce(initialState("x"), { type: "discography-fetching" });
    assert.equal(state.phase, "fetching-discography");

    state = reduce(state, { type: "discography-progress", done: 3, total: 10 });
    assert.deepEqual(state.discographyProgress, { done: 3, total: 10 });

    state = reduce(state, { type: "discography-resolved", trackCount: 42 });
    assert.equal(state.discographyTrackCount, 42);
  });

  await t.test("classify-queued sets the total and remembers each song's title/album for later events", () => {
    const state = reduce(initialState("x"), {
      type: "classify-queued",
      songs: [{ id: "a", title: "Song A", album: "Album A", releaseDate: "1999-01-01" }],
    });
    assert.equal(state.phase, "classifying");
    assert.equal(state.totalToClassify, 1);
    assert.deepEqual(state.queuedById.get("a"), {
      id: "a",
      title: "Song A",
      album: "Album A",
      releaseDate: "1999-01-01",
    });
  });

  await t.test("classify-started adds to inFlight using the title remembered from classify-queued", () => {
    let state = reduce(initialState("x"), {
      type: "classify-queued",
      songs: [{ id: "a", title: "Song A", album: "Album A" }],
    });
    state = reduce(state, { type: "classify-started", id: "a" });
    assert.equal(state.inFlight.get("a"), "Song A");
  });

  await t.test("classify-completed moves the song from inFlight into the log and accumulates tokens", () => {
    let state = reduce(initialState("x"), {
      type: "classify-queued",
      songs: [{ id: "a", title: "Song A", album: "Album A" }],
    });
    state = reduce(state, { type: "classify-started", id: "a" });
    state = reduce(state, {
      type: "classify-completed",
      id: "a",
      classification: classification({ track: "Song A" }),
      usage: { model: "jev-1.13.0", inputTokens: 500, outputTokens: 40, durationMs: 300 },
    });

    assert.equal(state.inFlight.has("a"), false);
    assert.equal(state.log.length, 1);
    assert.equal(state.log[0]?.title, "Song A");
    assert.equal(state.runningCount, 1);
    assert.deepEqual(state.runningTokens, { input: 500, output: 40 });
  });

  await t.test("classify-completed accumulates across multiple songs", () => {
    let state = initialState("x");
    for (const id of ["a", "b"]) {
      state = reduce(state, {
        type: "classify-completed",
        id,
        classification: classification({ track: id }),
        usage: { model: "jev-1.13.0", inputTokens: 100, outputTokens: 10, durationMs: 50 },
      });
    }
    assert.equal(state.log.length, 2);
    assert.equal(state.runningCount, 2);
    assert.deepEqual(state.runningTokens, { input: 200, output: 20 });
  });

  await t.test("classify-failed removes the song from inFlight and sets a friendly error message", () => {
    let state = reduce(initialState("x"), { type: "classify-started", id: "a" });
    state = reduce(state, { type: "classify-failed", id: "a", error: new Error("boom") });
    assert.equal(state.phase, "error");
    assert.equal(state.inFlight.has("a"), false);
    assert.equal(state.errorMessage, "boom");
  });

  await t.test("run-completed sets phase to done and carries the final meta + skipped count", () => {
    const meta = {
      artist: "x",
      generatedAt: new Date().toISOString(),
      model: "jev-1.13.0",
      songsClassifiedThisRun: 1,
      totalSongsInOutput: 1,
      tokens: { input: 100, output: 10 },
      estimatedCostUsd: 0.0001,
      durationMs: { classification: 500, total: 1000 },
    };
    const state = reduce(initialState("x"), { type: "run-completed", meta, skippedCount: 2, totalConsidered: 3 });
    assert.equal(state.phase, "done");
    assert.equal(state.meta, meta);
    assert.equal(state.skippedCount, 2);
  });
});
