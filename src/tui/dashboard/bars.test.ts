import { test } from "node:test";
import assert from "node:assert/strict";
import {
  albumStrip,
  complexityGlyph,
  formatYear,
  moodArcSeries,
  moodBar,
  moodScaleRamp,
  themeMixSegments,
} from "./bars.js";
import type { AlbumGroup, ThemeDistributionEntry } from "../../viz/data.js";
import type { SongClassification } from "../../types.js";

function song(overrides: Partial<SongClassification> = {}): SongClassification {
  return {
    artist: "Artist",
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

test("moodArcSeries", async (t) => {
  await t.test("emits one spark point per song when within the point budget", () => {
    const series = moodArcSeries([song({ mood: 0 }), song({ mood: 4 })], 10);
    assert.equal(series.length, 2);
    assert.equal(series[0]?.char, "▁"); // saddest -> lowest, non-blank mark
    assert.equal(series[1]?.char, "█"); // happiest -> highest mark
  });

  await t.test("resamples down when there are more songs than the point budget", () => {
    const songs = Array.from({ length: 20 }, () => song());
    const series = moodArcSeries(songs, 5);
    assert.equal(series.length, 5);
  });
});

test("moodScaleRamp", () => {
  const ramp = moodScaleRamp();
  assert.equal(ramp[0]?.char, "▁");
  assert.equal(ramp.at(-1)?.char, "█");
});

test("moodBar", async (t) => {
  await t.test("0 produces no filled block, but width empty", () => {
    const bar = moodBar(0, 4, 6);
    assert.equal(bar.filled, "");
    assert.equal(bar.empty.length, 6);
  });

  await t.test("max value fills the whole width", () => {
    const bar = moodBar(4, 4, 6);
    assert.equal(bar.filled, "██████");
    assert.equal(bar.empty, "");
  });

  await t.test("a fractional value produces a partial eighth-block", () => {
    const bar = moodBar(2, 4, 6); // exactly half
    assert.equal(bar.filled.length, 3);
  });
});

test("complexityGlyph", () => {
  assert.equal(complexityGlyph(0), "░");
  assert.equal(complexityGlyph(3), "█");
  assert.equal(complexityGlyph(10), "█"); // clamped
  assert.equal(complexityGlyph(-1), "░"); // clamped
});

test("themeMixSegments", async (t) => {
  await t.test("returns nothing for zero songs", () => {
    assert.deepEqual(themeMixSegments([], 0, 50), []);
  });

  await t.test("proportions sum to exactly barWidth despite rounding", () => {
    const dist: ThemeDistributionEntry[] = [
      { theme: "love", count: 1, percentage: 33.3 },
      { theme: "heartbreak", count: 1, percentage: 33.3 },
      { theme: "party_fun", count: 1, percentage: 33.3 },
    ];
    const segments = themeMixSegments(dist, 3, 10);
    assert.equal(
      segments.reduce((sum, s) => sum + s.width, 0),
      10,
    );
  });
});

test("albumStrip", async (t) => {
  await t.test("pads with dim placeholder dots when the album has fewer songs than the strip width", () => {
    const album: AlbumGroup = { album: "A", songs: [song()], avgMood: 2, avgComplexity: 1 };
    const strip = albumStrip(album, 5);
    assert.equal(strip.length, 5);
    assert.equal(strip[0]?.char, "█");
    assert.equal(strip[1]?.dim, true);
  });

  await t.test("truncates with an ellipsis when the album has more songs than the strip width", () => {
    const album: AlbumGroup = { album: "A", songs: Array.from({ length: 10 }, () => song()), avgMood: 2, avgComplexity: 1 };
    const strip = albumStrip(album, 5);
    assert.equal(strip.length, 5);
    assert.equal(strip.at(-1)?.char, "…");
  });
});

test("formatYear", () => {
  assert.equal(formatYear("1994-05-10"), "1994");
  assert.equal(formatYear(undefined), "????");
});
