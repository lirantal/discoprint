import { test } from "node:test";
import assert from "node:assert/strict";
import {
  averagesSubtitle,
  averageStatValues,
  CLASSIFICATION_STAT_SPECS,
  computeClassificationAverages,
  STAT_BAR_WIDTH,
  statBarFill,
} from "./classification-averages.js";
import { buildVisualizationData } from "./data.js";
import type { SongClassification } from "../types.js";

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

test("computeClassificationAverages", async (t) => {
  await t.test("returns null for an empty discography", () => {
    assert.equal(computeClassificationAverages(buildVisualizationData("Artist", [], 0)), null);
  });

  await t.test("averages every stat row across all songs", () => {
    const data = buildVisualizationData(
      "Artist",
      [
        song({ track: "A", mood: 1, complexity: 0, explicit: 0, firstPerson: 1, themeConfidence: 0.6 }),
        song({ track: "B", mood: 3, complexity: 2, explicit: 1, firstPerson: 0, themeConfidence: 1 }),
      ],
      0,
    );

    const averages = computeClassificationAverages(data);
    assert.ok(averages);
    assert.deepEqual(averages.values, { mood: 2, complexity: 1, explicit: 0.5, firstPerson: 0.5 });
    assert.equal(averages.themeConfidence, 0.8);
    assert.equal(averages.songCount, 2);
    assert.equal(averages.albumCount, 1);
  });

  await t.test("reports the most common theme and its share, not just the first one seen", () => {
    const data = buildVisualizationData(
      "Artist",
      [
        song({ track: "A", theme: "love", releaseDate: "2001-01-01" }),
        song({ track: "B", theme: "heartbreak", releaseDate: "2002-01-01" }),
        song({ track: "C", theme: "heartbreak", releaseDate: "2003-01-01" }),
        song({ track: "D", theme: "heartbreak", releaseDate: "2004-01-01" }),
      ],
      0,
    );

    const averages = computeClassificationAverages(data);
    assert.ok(averages);
    assert.equal(averages.topTheme.theme, "heartbreak");
    assert.equal(averages.topTheme.share, 0.75);
  });

  await t.test("counts distinct albums", () => {
    const data = buildVisualizationData(
      "Artist",
      [song({ album: "One" }), song({ album: "One" }), song({ album: "Two" })],
      0,
    );

    assert.equal(computeClassificationAverages(data)?.albumCount, 2);
  });
});

test("averageStatValues returns zeros for no songs", () => {
  assert.deepEqual(averageStatValues([]), { mood: 0, complexity: 0, explicit: 0, firstPerson: 0 });
});

test("averagesSubtitle", async (t) => {
  await t.test("pluralizes songs and albums", () => {
    const many = buildVisualizationData("Artist", [song({ album: "One" }), song({ album: "Two" })], 0);
    assert.equal(averagesSubtitle(computeClassificationAverages(many)!), "across 2 songs · 2 albums");
  });

  await t.test("stays singular for a one-song discography", () => {
    const one = buildVisualizationData("Artist", [song({})], 0);
    assert.equal(averagesSubtitle(computeClassificationAverages(one)!), "across 1 song · 1 album");
  });
});

test("statBarFill", async (t) => {
  await t.test("fills nothing at zero and everything at max", () => {
    assert.equal(statBarFill(0, 4), 0);
    assert.equal(statBarFill(4, 4), STAT_BAR_WIDTH);
  });

  await t.test("scales proportionally against each row's own max", () => {
    assert.equal(statBarFill(2, 4, 16), 8);
    assert.equal(statBarFill(1.5, 3, 16), 8);
    assert.equal(statBarFill(0.5, 1, 16), 8);
  });

  await t.test("clamps out-of-range values instead of overflowing the bar", () => {
    assert.equal(statBarFill(9, 4, 16), 16);
    assert.equal(statBarFill(-1, 4, 16), 0);
  });

  await t.test("treats a zero max as an empty bar rather than dividing by zero", () => {
    assert.equal(statBarFill(1, 0, 16), 0);
  });
});

test("CLASSIFICATION_STAT_SPECS covers every bar row exactly once, in draw order", () => {
  assert.deepEqual(
    CLASSIFICATION_STAT_SPECS.map((spec) => spec.key),
    ["mood", "complexity", "explicit", "firstPerson"],
  );
});
