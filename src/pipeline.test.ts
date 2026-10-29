import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sleep } from "./util.js";
import type { PipelineEvent } from "./pipeline-events.js";

process.env.MUSICBRAINZ_MIN_INTERVAL_MS = "0";
process.env.MUSICBRAINZ_RETRY_BASE_MS = "0";
process.env.LRCLIB_MIN_INTERVAL_MS = "0";
process.env.TYPESAFE_API_KEY = "test-key";

const tmpDir = await mkdtemp(join(tmpdir(), "alc-pipeline-test-"));
// Isolates cache/output from the real default (XDG config dir) — see
// resolveDataDir() in src/paths.ts.
process.env.DISCOPRINT_DATA_DIR = join(tmpDir, "data");

const { runPipeline } = await import("./pipeline.js");

test.after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// searchArtist() is never cached, so every runPipeline() call hits this regardless of options.
function mockArtistSearch(url: string): Response | undefined {
  if (!url.includes("/artist/?query=")) return undefined;
  return jsonResponse({ artists: [{ id: "artist-1", name: "Test Artist", score: 100 }] });
}

/** One release-group with two tracks: "Song One" (has lyrics) and "Song Two" (no lyrics anywhere). */
function mockDiscography(url: string): Response | undefined {
  if (url.includes("/release-group?")) {
    return jsonResponse({
      "release-group-count": 1,
      "release-groups": [
        {
          id: "rg-1",
          title: "Test Album",
          "primary-type": "Album",
          "secondary-types": [],
          "first-release-date": "2001-01-01",
        },
      ],
    });
  }
  if (url.includes("/release?release-group=rg-1")) {
    return jsonResponse({
      releases: [
        {
          id: "rel-1",
          media: [
            {
              tracks: [
                { id: "t1", title: "Song One", recording: { id: "rec-1", title: "Song One" } },
                { id: "t2", title: "Song Two", recording: { id: "rec-2", title: "Song Two" } },
              ],
            },
          ],
        },
      ],
    });
  }
  return undefined;
}

function mockLyrics(url: string): Response | undefined {
  if (url.includes("lrclib.net/api/get") && url.includes("Song%20One")) {
    return jsonResponse({
      trackName: "Song One",
      artistName: "Test Artist",
      plainLyrics: "la la la",
      instrumental: false,
    });
  }
  if (url.includes("lrclib.net/api/get") && url.includes("Song%20Two")) {
    return new Response("", { status: 404 });
  }
  if (url.includes("lrclib.net/api/search") && url.includes("Song%20Two")) {
    return jsonResponse([]); // no lyrics found anywhere for Song Two
  }
  return undefined;
}

function mockJevClassification(theme: string, mood: number): (url: string) => Response | undefined {
  return (url) => {
    if (!url.endsWith("/v1/systemone")) return undefined;
    return jsonResponse({
      answers: {
        theme: { type: "choice", choice: theme, confidence: 0.9, probabilities: {} },
        mood: { type: "score", score: mood, confidence: 0.8, probabilities: {}, legend: {} },
        complexity: { type: "score", score: 1, confidence: 0.6, probabilities: {}, legend: {} },
        explicit: { type: "noul", noul: 0.01 },
        firstPerson: { type: "noul", noul: 0.4 },
      },
      model: "jev-latest",
      usage: { input_tokens: 50, output_tokens: 8 },
    });
  };
}

function router(url: string, handlers: Array<(url: string) => Response | undefined>): Response {
  for (const handler of handlers) {
    const response = handler(url);
    if (response) return response;
  }
  throw new Error(`Unexpected fetch: ${url}`);
}

test("runPipeline populates every cache layer on a fresh run", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) =>
    router(url, [mockArtistSearch, mockDiscography, mockLyrics, mockJevClassification("party_fun", 3.2)]),
  );

  await runPipeline("Test Artist", {});

  const output = JSON.parse(await readFile(join(tmpDir, "data", "output", "test-artist.json"), "utf-8"));
  assert.equal(output.length, 1);
  assert.equal(output[0].track, "Song One");
  assert.equal(output[0].theme, "party_fun");
  assert.equal(output[0].mood, 3.2);

  const skipped = JSON.parse(await readFile(join(tmpDir, "data", "output", "test-artist-skipped.json"), "utf-8"));
  assert.deepEqual(skipped, [{ track: "Song Two", reason: "no lyrics found" }]);

  const meta = JSON.parse(await readFile(join(tmpDir, "data", "output", "test-artist-meta.json"), "utf-8"));
  assert.equal(meta.artist, "Test Artist");
  assert.equal(meta.model, "jev-latest");
  assert.equal(meta.songsClassifiedThisRun, 1);
  assert.equal(meta.totalSongsInOutput, 1);
  assert.deepEqual(meta.tokens, { input: 50, output: 8 });
  assert.ok(meta.estimatedCostUsd > 0);
  assert.ok(meta.durationMs.classification >= 0);
  assert.ok(meta.durationMs.total >= meta.durationMs.classification);
  assert.ok(!Number.isNaN(Date.parse(meta.generatedAt)));
});

test("runPipeline rerun only re-resolves the artist; discography/lyrics/classification stay cached", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => router(url, [mockArtistSearch]));

  await runPipeline("Test Artist", {});

  const output = JSON.parse(await readFile(join(tmpDir, "data", "output", "test-artist.json"), "utf-8"));
  assert.equal(output.length, 1);
  assert.equal(output[0].track, "Song One");
  assert.equal(output[0].theme, "party_fun"); // unchanged from the first run

  // Nothing was actually classified this run, so the meta reflects zero new Jev usage.
  const meta = JSON.parse(await readFile(join(tmpDir, "data", "output", "test-artist-meta.json"), "utf-8"));
  assert.equal(meta.model, null);
  assert.equal(meta.songsClassifiedThisRun, 0);
  assert.equal(meta.totalSongsInOutput, 1);
  assert.deepEqual(meta.tokens, { input: 0, output: 0 });
  assert.equal(meta.estimatedCostUsd, 0);
});

test("runPipeline emits classify-queued/started/completed for cached songs too, with zero usage — so a live view can still animate a fully-cached run", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => router(url, [mockArtistSearch]));

  const events: PipelineEvent[] = [];
  await runPipeline("Test Artist", { onEvent: (e) => events.push(e) });

  assert.ok(events.some((e) => e.type === "classify-queued"));
  assert.ok(events.some((e) => e.type === "classify-started"));
  const completed = events.find(
    (e): e is Extract<PipelineEvent, { type: "classify-completed" }> => e.type === "classify-completed",
  );
  assert.ok(completed);
  assert.equal(completed.usage.inputTokens, 0);
  assert.equal(completed.usage.outputTokens, 0);
});

test("runPipeline --force re-fetches discography and re-classifies, but not lyrics", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) =>
    router(url, [mockArtistSearch, mockDiscography, mockJevClassification("self_reflection", 1.5)]),
  );

  await runPipeline("Test Artist", { force: true });

  const output = JSON.parse(await readFile(join(tmpDir, "data", "output", "test-artist.json"), "utf-8"));
  assert.equal(output[0].theme, "self_reflection");
  assert.equal(output[0].mood, 1.5);
});

test("runPipeline --limit caps how many tracks are processed, without touching lyrics/classification for the rest", async (t) => {
  // No discography/lyrics handlers: everything needed is cached from prior tests, so
  // the only permitted call is artist resolution. Song Two would fail lyrics lookup
  // if it were touched, since no lrclib handler is wired up here.
  t.mock.method(globalThis, "fetch", async (url: string) => router(url, [mockArtistSearch]));

  await runPipeline("Test Artist", { limit: 1 });

  const output = JSON.parse(await readFile(join(tmpDir, "data", "output", "test-artist.json"), "utf-8"));
  assert.equal(output.length, 1);
  assert.equal(output[0].track, "Song One");
  assert.equal(output[0].theme, "self_reflection"); // still the forced-rerun value, from cache
});

test("runPipeline reports progress via onEvent, ending with run-completed", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) =>
    router(url, [mockArtistSearch, mockDiscography, mockJevClassification("love", 2)]),
  );

  const events: string[] = [];
  await runPipeline("Test Artist", { force: true, onEvent: (e) => events.push(e.type) });

  assert.deepEqual(events.slice(0, 2), ["artist-resolving", "artist-resolved"]);
  assert.ok(events.includes("discography-fetching"));
  assert.ok(events.includes("discography-resolved"));
  assert.ok(events.includes("classify-queued"));
  assert.ok(events.includes("classify-started"));
  assert.ok(events.includes("classify-completed"));
  assert.equal(events.at(-1), "run-completed");
});

test("runPipeline reports a MusicBrainz rate-limit retry via onEvent instead of writing to the console", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/artist/?query=")) {
      calls++;
      if (calls < 2) return new Response("", { status: 503 });
      return jsonResponse({ artists: [{ id: "artist-retry", name: "Retry Artist", score: 100 }] });
    }
    return router(url, [mockDiscography, mockLyrics, mockJevClassification("love", 2)]);
  });

  const events: string[] = [];
  await runPipeline("Retry Artist", { limit: 1, onEvent: (e) => events.push(e.type) });

  assert.ok(events.includes("musicbrainz-retry"));
  assert.equal(events.at(-1), "run-completed");
});

test("runPipeline emits run-failed and rejects when artist resolution exhausts its retries", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 503 }));

  const events: string[] = [];
  await assert.rejects(() => runPipeline("Persistently Rate Limited Artist", { onEvent: (e) => events.push(e.type) }));

  assert.ok(events.includes("musicbrainz-retry"));
  assert.equal(events.at(-1), "run-failed");
  assert.ok(!events.includes("run-completed"));
});

test("runPipeline calling onEvent is optional — nothing breaks without one", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => router(url, [mockArtistSearch]));
  await assert.doesNotReject(() => runPipeline("Test Artist", { limit: 1 }));
});

test("runPipeline emits classify-failed and rejects, without a run-completed, when a Jev call fails", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("/v1/systemone")) return new Response("", { status: 500 });
    return router(url, [mockArtistSearch, mockDiscography]);
  });

  const events: string[] = [];
  await assert.rejects(() => runPipeline("Test Artist", { force: true, onEvent: (e) => events.push(e.type) }));

  assert.ok(events.includes("classify-failed"));
  assert.ok(!events.includes("run-completed"));
});

test("runPipeline classifies songs concurrently, so classification wall time isn't a sum of the individual calls", async (t) => {
  const CALL_DELAY_MS = 60;
  const SONG_COUNT = 4;

  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/artist/?query=")) {
      return jsonResponse({ artists: [{ id: "artist-concurrency", name: "Concurrency Artist", score: 100 }] });
    }
    if (url.includes("/release-group?")) {
      return jsonResponse({
        "release-group-count": 1,
        "release-groups": [
          {
            id: "rg-1",
            title: "Album",
            "primary-type": "Album",
            "secondary-types": [],
            "first-release-date": "2001-01-01",
          },
        ],
      });
    }
    if (url.includes("/release?release-group=rg-1")) {
      return jsonResponse({
        releases: [
          {
            id: "rel-1",
            media: [
              {
                tracks: Array.from({ length: SONG_COUNT }, (_, i) => ({
                  id: `t${i}`,
                  title: `Song ${i}`,
                  recording: { id: `rec-${i}`, title: `Song ${i}` },
                })),
              },
            ],
          },
        ],
      });
    }
    if (url.includes("lrclib.net/api/get")) {
      return jsonResponse({ trackName: "x", artistName: "x", plainLyrics: "la la la", instrumental: false });
    }
    if (url.endsWith("/v1/systemone")) {
      await sleep(CALL_DELAY_MS);
      return jsonResponse({
        answers: {
          theme: { type: "choice", choice: "love", confidence: 0.9, probabilities: {} },
          mood: { type: "score", score: 2, confidence: 0.8, probabilities: {}, legend: {} },
          complexity: { type: "score", score: 1, confidence: 0.6, probabilities: {}, legend: {} },
          explicit: { type: "noul", noul: 0.01 },
          firstPerson: { type: "noul", noul: 0.4 },
        },
        model: "jev-latest",
        usage: { input_tokens: 50, output_tokens: 8 },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  await runPipeline("Concurrency Artist", {});

  const meta = JSON.parse(await readFile(join(tmpDir, "data", "output", "concurrency-artist-meta.json"), "utf-8"));
  assert.equal(meta.songsClassifiedThisRun, SONG_COUNT);
  // If calls ran sequentially this would take >= SONG_COUNT * CALL_DELAY_MS;
  // concurrently, it should take roughly one call's worth of time.
  assert.ok(
    meta.durationMs.classification < SONG_COUNT * CALL_DELAY_MS,
    `expected concurrent wall time < ${SONG_COUNT * CALL_DELAY_MS}ms, got ${meta.durationMs.classification}ms`,
  );
});
