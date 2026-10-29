import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { average, buildVisualizationData, loadVisualizationData, resample } from "./data.js";
import type { ClassificationRunMeta, SongClassification } from "../types.js";

function meta(overrides: Partial<ClassificationRunMeta> = {}): ClassificationRunMeta {
  return {
    artist: "Test Artist",
    generatedAt: "2026-01-01T00:00:00.000Z",
    model: "jev-1.13.0",
    songsClassifiedThisRun: 3,
    totalSongsInOutput: 3,
    tokens: { input: 900, output: 60 },
    estimatedCostUsd: 0.0000378,
    durationMs: { classification: 1200, total: 4000 },
    ...overrides,
  };
}

function song(overrides: Partial<SongClassification>): SongClassification {
  return {
    artist: "Test Artist",
    track: "Track",
    album: "Album",
    releaseDate: "2000-01-01",
    lyricsSource: "lrclib-get",
    theme: "love",
    themeConfidence: 0.8,
    mood: 2,
    moodConfidence: 0.8,
    complexity: 1,
    complexityConfidence: 0.8,
    explicit: 0.1,
    firstPerson: 0.5,
    ...overrides,
  };
}

test("average", () => {
  assert.equal(average([]), 0);
  assert.equal(average([1, 2, 3]), 2);
});

test("resample", async (t) => {
  await t.test("is a no-op when already short enough", () => {
    assert.deepEqual(resample([1, 2, 3], 5), [1, 2, 3]);
    assert.deepEqual(resample([1, 2, 3], 3), [1, 2, 3]);
  });

  await t.test("buckets down to the target length by averaging", () => {
    const result = resample([0, 0, 4, 4], 2);
    assert.deepEqual(result, [0, 4]);
  });

  await t.test("handles a target length that doesn't evenly divide", () => {
    const result = resample([1, 2, 3, 4, 5], 2);
    assert.equal(result.length, 2);
  });
});

test("buildVisualizationData", async (t) => {
  await t.test("sorts songs chronologically by release date", () => {
    const data = buildVisualizationData(
      "Artist",
      [song({ track: "B", releaseDate: "2005-01-01" }), song({ track: "A", releaseDate: "2000-01-01" })],
      0,
    );
    assert.deepEqual(
      data.songs.map((s) => s.track),
      ["A", "B"],
    );
  });

  await t.test("groups songs into albums preserving first-seen order, with correct averages", () => {
    const data = buildVisualizationData(
      "Artist",
      [
        song({ track: "A1", album: "Alpha", releaseDate: "2000-01-01", mood: 0, complexity: 0 }),
        song({ track: "B1", album: "Beta", releaseDate: "2001-01-01", mood: 4, complexity: 2 }),
        song({ track: "A2", album: "Alpha", releaseDate: "2000-01-01", mood: 2, complexity: 2 }),
      ],
      0,
    );

    assert.equal(data.albums.length, 2);
    assert.ok(data.albums[0]);
    assert.ok(data.albums[1]);
    assert.equal(data.albums[0].album, "Alpha");
    assert.equal(data.albums[0].songs.length, 2);
    assert.equal(data.albums[0].avgMood, 1); // (0 + 2) / 2
    assert.equal(data.albums[0].avgComplexity, 1); // (0 + 2) / 2
    assert.equal(data.albums[1].album, "Beta");
  });

  await t.test("computes theme distribution sorted by count, descending", () => {
    const data = buildVisualizationData(
      "Artist",
      [song({ theme: "love" }), song({ theme: "love" }), song({ theme: "heartbreak" })],
      0,
    );

    assert.deepEqual(
      data.themeDistribution.map((d) => d.theme),
      ["love", "heartbreak"],
    );
    assert.ok(data.themeDistribution[0]);
    assert.equal(data.themeDistribution[0].count, 2);
    assert.equal(Math.round(data.themeDistribution[0].percentage), 67);
  });

  await t.test("computes the date range from earliest to latest release", () => {
    const data = buildVisualizationData(
      "Artist",
      [song({ releaseDate: "2010-01-01" }), song({ releaseDate: "1995-01-01" }), song({ releaseDate: "2003-01-01" })],
      0,
    );
    assert.deepEqual(data.dateRange, { from: "1995-01-01", to: "2010-01-01" });
  });

  await t.test("handles an empty song list without crashing", () => {
    const data = buildVisualizationData("Artist", [], 5);
    assert.deepEqual(data.songs, []);
    assert.deepEqual(data.albums, []);
    assert.deepEqual(data.themeDistribution, []);
    assert.equal(data.skippedCount, 5);
    assert.deepEqual(data.dateRange, { from: undefined, to: undefined });
  });

  await t.test("tolerates a missing releaseDate", () => {
    const data = buildVisualizationData("Artist", [song({ releaseDate: undefined })], 0);
    assert.equal(data.songs.length, 1);
    assert.deepEqual(data.dateRange, { from: undefined, to: undefined });
  });

  await t.test("passes through lastRunMeta when provided, omits it when not", () => {
    const withMeta = buildVisualizationData("Artist", [song({})], 0, meta());
    assert.deepEqual(withMeta.lastRunMeta, meta());

    const withoutMeta = buildVisualizationData("Artist", [song({})], 0);
    assert.equal(withoutMeta.lastRunMeta, undefined);
  });
});

test("loadVisualizationData", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "alc-viz-data-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  await t.test("loads and shapes classification output, including the skipped count", async () => {
    await writeFile(join(dir, "test-artist.json"), JSON.stringify([song({ track: "Only Song" })]));
    await writeFile(
      join(dir, "test-artist-skipped.json"),
      JSON.stringify([{ track: "Skipped", reason: "no lyrics found" }]),
    );

    const data = await loadVisualizationData(dir, "test-artist", "Test Artist");
    assert.equal(data.songs.length, 1);
    assert.equal(data.skippedCount, 1);
  });

  await t.test("defaults skippedCount to 0 when the skipped file is absent", async () => {
    await writeFile(join(dir, "another-artist.json"), JSON.stringify([song({})]));

    const data = await loadVisualizationData(dir, "another-artist", "Another Artist");
    assert.equal(data.skippedCount, 0);
  });

  await t.test("loads lastRunMeta when the meta file exists", async () => {
    await writeFile(join(dir, "with-meta.json"), JSON.stringify([song({})]));
    await writeFile(join(dir, "with-meta-meta.json"), JSON.stringify(meta({ songsClassifiedThisRun: 5 })));

    const data = await loadVisualizationData(dir, "with-meta", "With Meta");
    assert.equal(data.lastRunMeta?.songsClassifiedThisRun, 5);
  });

  await t.test("lastRunMeta is undefined when the meta file is absent", async () => {
    await writeFile(join(dir, "no-meta.json"), JSON.stringify([song({})]));

    const data = await loadVisualizationData(dir, "no-meta", "No Meta");
    assert.equal(data.lastRunMeta, undefined);
  });

  await t.test("throws a KnownError when the output file doesn't exist", async () => {
    await assert.rejects(
      () => loadVisualizationData(dir, "nonexistent", "Nonexistent"),
      (err: unknown) => err instanceof Error && err.name === "KnownError" && /Run `pnpm run classify/.test(err.message),
    );
  });
});
