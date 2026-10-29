import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVisualizationData } from "./data.js";
import {
  computeDiscographyStats,
  discographyPanelRowCount,
  gridColumns,
  gridRowCount,
  gridRows,
  hiddenSongCount,
} from "./discography-grid.js";
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

test("computeDiscographyStats", async (t) => {
  await t.test("returns nothing for an empty discography", () => {
    const data = buildVisualizationData("Artist", [], 0);
    assert.deepEqual(computeDiscographyStats(data), []);
  });

  await t.test("summarizes songs, albums, years, top theme, avg mood, and busiest album", () => {
    const data = buildVisualizationData(
      "Artist",
      [
        song({ track: "A", album: "Album One", releaseDate: "1980-01-01", theme: "love", mood: 0 }),
        song({ track: "B", album: "Album One", releaseDate: "1981-01-01", theme: "love", mood: 4 }),
        song({ track: "C", album: "Album Two", releaseDate: "1982-01-01", theme: "heartbreak", mood: 2 }),
      ],
      0,
    );

    const stats = computeDiscographyStats(data);
    assert.deepEqual(
      stats.map((s) => s.label),
      ["songs", "albums", "years active", "top theme", "avg mood", "busiest album"],
    );
    assert.equal(stats[0]?.value, "3");
    assert.equal(stats[1]?.value, "2");
    assert.equal(stats[2]?.value, "1980–1982");
    assert.equal(stats[3]?.value, "love 67%");
    assert.equal(stats[4]?.value, "2.0 / 4");
    assert.equal(stats[5]?.value, "Album One (2)");
  });

  await t.test("collapses the years stat to a single year when everything released the same year", () => {
    const data = buildVisualizationData(
      "Artist",
      [song({ releaseDate: "1999-01-01" }), song({ releaseDate: "1999-06-01" })],
      0,
    );
    assert.equal(computeDiscographyStats(data)[2]?.value, "1999");
  });
});

test("gridColumns", () => {
  assert.equal(gridColumns(90, 3), 30);
  // Never drops below the minimum, even for a very narrow width.
  assert.equal(gridColumns(10, 3), 8);
});

test("gridRows / gridRowCount / hiddenSongCount", async (t) => {
  await t.test("chunks songs into fixed-width rows, preserving order", () => {
    const songs = Array.from({ length: 7 }, (_, i) => song({ track: `Song ${i}` }));
    const rows = gridRows(songs, 3);
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => r.length),
      [3, 3, 1],
    );
    assert.equal(rows[0]?.[0]?.track, "Song 0");
  });

  await t.test("gridRowCount matches how many rows gridRows actually produces below the cap", () => {
    const songs = Array.from({ length: 55 }, () => song({}));
    assert.equal(gridRowCount(55, 10), gridRows(songs, 10).length);
  });

  await t.test("caps at MAX_GRID_ROWS and reports the hidden count for a huge discography", () => {
    const columns = 10;
    const totalSongs = 250; // 25 rows at 10/row, past the 20-row cap
    const songs = Array.from({ length: totalSongs }, () => song({}));

    const rows = gridRows(songs, columns);
    assert.equal(rows.length, 20);
    assert.equal(gridRowCount(totalSongs, columns), 20);
    assert.equal(hiddenSongCount(totalSongs, columns), totalSongs - 20 * columns);
  });

  await t.test("hiddenSongCount is 0 when everything fits under the cap", () => {
    assert.equal(hiddenSongCount(50, 10), 0);
  });
});

test("discographyPanelRowCount", async (t) => {
  await t.test("is 0 for an empty discography", () => {
    assert.equal(discographyPanelRowCount(0, 90), 0);
  });

  await t.test("adds the grid's own row count on top of the fixed chrome", () => {
    const columns = gridColumns(90, 3);
    const oneSongTotal = discographyPanelRowCount(1, 90);
    const oneSongGridRows = gridRowCount(1, columns);
    // The fixed chrome (border/title/stats/label) is always present on top of the grid's own rows.
    assert.ok(oneSongTotal > oneSongGridRows);

    // Adding a second full row of songs should grow the total by exactly one row.
    const twoRowsTotal = discographyPanelRowCount(columns + 1, 90);
    assert.equal(twoRowsTotal, oneSongTotal + 1);
  });
});
