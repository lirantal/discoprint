import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVisualizationData } from "./data.js";
import { renderTerminal } from "./render-terminal.js";
import type { ClassificationRunMeta, SongClassification } from "../types.js";

function meta(overrides: Partial<ClassificationRunMeta> = {}): ClassificationRunMeta {
  return {
    artist: "Test Artist",
    generatedAt: "2026-01-01T00:00:00.000Z",
    model: "jev-1.13.0",
    songsClassifiedThisRun: 3,
    totalSongsInOutput: 3,
    tokens: { input: 3800, output: 240 },
    estimatedCostUsd: 0.00015960000000000001,
    durationMs: { classification: 4200, total: 9100 },
    ...overrides,
  };
}

function stripAnsi(text: string): string {
  return text.replace(/\[[0-9;]*m/g, "");
}

function makeSongs(count: number, songsPerAlbum = 10): SongClassification[] {
  const songs: SongClassification[] = [];
  for (let i = 0; i < count; i++) {
    const albumIndex = Math.floor(i / songsPerAlbum);
    songs.push({
      artist: "Test Artist",
      track: `Track ${i}`,
      album: `Album ${albumIndex}`,
      releaseDate: `${2000 + albumIndex}-01-01`,
      lyricsSource: "lrclib-get",
      theme: ["love", "heartbreak", "party_fun"][i % 3] ?? "love",
      themeConfidence: 0.8,
      mood: i % 5,
      moodConfidence: 0.8,
      complexity: i % 4,
      complexityConfidence: 0.8,
      explicit: 0.1,
      firstPerson: 0.5,
    });
  }
  return songs;
}

test("renderTerminal", async (t) => {
  await t.test("renders one row per song when everything fits within the terminal height", () => {
    const data = buildVisualizationData("Test Artist", makeSongs(8), 0);
    const lines = renderTerminal(data, { width: 80, height: 40, colorEnabled: false });
    // Per-song rows lead with the theme swatch, then the year, then the track title.
    const trackLines = lines.filter((l) => /^██ \d{4} Track \d+/.test(l));
    assert.equal(trackLines.length, 8);
  });

  await t.test("falls back to one row per album when songs exceed the available height", () => {
    const data = buildVisualizationData("Test Artist", makeSongs(60, 10), 0);
    const lines = renderTerminal(data, { width: 90, height: 20, colorEnabled: false });
    // Per-album rows lead directly with the year, no theme swatch.
    const albumLines = lines.filter((l) => /^\d{4} Album \d+/.test(l));
    assert.equal(albumLines.length, 6); // 60 songs / 10 per album
    for (const l of lines) assert.doesNotMatch(l, /Track \d+/);
  });

  await t.test("album rows keep their columns aligned regardless of track count per album", () => {
    const songs = [
      ...makeSongs(5, 5),
      ...makeSongs(20, 20).map((s, i) => ({ ...s, album: "Big Album", track: `Big ${i}` })),
    ];
    const data = buildVisualizationData("Test Artist", songs, 0);
    const lines = renderTerminal(data, { width: 100, height: 5, colorEnabled: false });

    const albumLines = lines.filter((l) => /^\d{4} /.test(l));
    assert.ok(albumLines.length >= 2);
    // Every album row should be the exact same length, so trailing columns
    // (mood bar, complexity, count) line up regardless of album size.
    assert.equal(new Set(albumLines.map((l) => l.length)).size, 1);
  });

  await t.test("handles zero classified songs without crashing", () => {
    const data = buildVisualizationData("Empty Artist", [], 3);
    const lines = renderTerminal(data, { width: 80, height: 24, colorEnabled: false });
    assert.ok(lines.some((l) => l.includes("No classified songs yet.")));
    assert.ok(lines.some((l) => l.includes("Empty Artist")));
  });

  await t.test("handles a single song without crashing", () => {
    const data = buildVisualizationData("Solo Artist", makeSongs(1), 0);
    const lines = renderTerminal(data, { width: 80, height: 24, colorEnabled: false });
    assert.ok(lines.some((l) => l.includes("Track 0")));
  });

  await t.test("truncates a very long song/album title instead of overflowing", () => {
    const longTitle = "A".repeat(200);
    const [firstSong] = makeSongs(1);
    assert.ok(firstSong);
    const data = buildVisualizationData("Test Artist", [{ ...firstSong, track: longTitle }], 0);
    const lines = renderTerminal(data, { width: 60, height: 24, colorEnabled: false });
    // The column header intentionally spells out its trailing legend past the data
    // width (nothing follows it), so only data rows need to respect the width.
    const dataRow = lines.find((l) => l.includes("A"));
    assert.ok(dataRow);
    assert.ok(stripAnsi(dataRow).length <= 60 + 5); // small slack for edge rounding
  });

  await t.test("respects an explicit width narrower than the default", () => {
    const data = buildVisualizationData("Test Artist", makeSongs(3), 0);
    const wide = renderTerminal(data, { width: 100, height: 24, colorEnabled: false });
    const narrow = renderTerminal(data, { width: 50, height: 24, colorEnabled: false });
    assert.notDeepEqual(wide, narrow);
  });

  await t.test("the theme legend and the theme-mix bar start their content at the same column (regression)", () => {
    // A real bug: the legend label grew ("themes (3/8)") while "theme mix"
    // stayed fixed-width, so the color chips and the bar below them no
    // longer lined up vertically.
    const data = buildVisualizationData("Test Artist", makeSongs(5), 0);
    const lines = renderTerminal(data, { width: 80, height: 24, colorEnabled: false });
    const legendLine = lines.find((l) => l.startsWith("themes ("));
    const mixLine = lines.find((l) => l.startsWith("theme mix"));
    assert.ok(legendLine);
    assert.ok(mixLine);
    assert.equal(legendLine.indexOf("██"), mixLine.indexOf("█"));
  });

  await t.test("renders the classification average block with one row per classified attribute", () => {
    const data = buildVisualizationData("Test Artist", makeSongs(9), 0);
    const lines = renderTerminal(data, { width: 80, height: 40, colorEnabled: false });

    const titleIndex = lines.findIndex((l) => l.startsWith("CLASSIFICATION AVERAGE"));
    assert.ok(titleIndex >= 0);
    assert.match(lines[titleIndex]!, /across 9 songs · 1 album$/);

    const rows = lines.slice(titleIndex + 1, titleIndex + 6);
    assert.deepEqual(
      rows.map((l) => l.slice(0, 12).trimEnd()),
      ["theme", "mood", "complexity", "explicit", "1st person"],
    );
    // Every bar row starts its bar at the same column, and is a full
    // STAT_BAR_WIDTH of filled + empty cells regardless of its value.
    for (const row of rows.slice(1)) {
      assert.match(row, /^.{12}[█░]{16} \d\.\d{2}$/u);
    }
  });

  await t.test("omits the classification average block when nothing is classified", () => {
    const data = buildVisualizationData("Test Artist", [], 0);
    const lines = renderTerminal(data, { width: 80, height: 24, colorEnabled: false });
    assert.equal(
      lines.find((l) => l.startsWith("CLASSIFICATION AVERAGE")),
      undefined,
    );
  });

  await t.test("omits the jev usage footer when there's no run metadata", () => {
    const data = buildVisualizationData("Test Artist", makeSongs(3), 0);
    const lines = renderTerminal(data, { width: 80, height: 24, colorEnabled: false });
    assert.ok(!lines.some((l) => l.includes("jev usage")));
  });

  await t.test("shows a fully-cached message when the last run classified nothing new", () => {
    const data = buildVisualizationData(
      "Test Artist",
      makeSongs(3),
      0,
      meta({ songsClassifiedThisRun: 0, model: null, tokens: { input: 0, output: 0 }, estimatedCostUsd: 0 }),
    );
    const lines = renderTerminal(data, { width: 80, height: 24, colorEnabled: false });
    const usageLine = lines.find((l) => l.startsWith("jev usage"));
    assert.ok(usageLine);
    assert.match(usageLine, /fully cached/);
  });

  await t.test("shows songs/model/tokens/cost/duration when the last run did real classification work", () => {
    const data = buildVisualizationData("Test Artist", makeSongs(3), 0, meta());
    const lines = renderTerminal(data, { width: 80, height: 24, colorEnabled: false });
    const usageLine = lines.find((l) => l.startsWith("jev usage"));
    assert.ok(usageLine);
    assert.match(usageLine, /3 songs classified/);
    assert.match(usageLine, /jev-1\.13\.0/);
    assert.match(usageLine, /3\.8K in \/ 240 out tok/);
    assert.match(usageLine, /\$0\.0002/); // rounds up from 0.0001596
    assert.match(usageLine, /4\.2s classifying/);
  });

  await t.test("the mood arc renders a visible mark even for the saddest possible songs (regression)", () => {
    // A real bug: the sparkline's lowest level used to be a literal space, so
    // mood=0 songs (an artist's saddest material) rendered as invisible gaps
    // instead of a visible mark.
    const allSad = makeSongs(5).map((s) => ({ ...s, mood: 0 }));
    const data = buildVisualizationData("Sad Artist", allSad, 0);
    const lines = renderTerminal(data, { width: 80, height: 24, colorEnabled: false });
    const arcLine = lines.find((l) => l.startsWith("mood arc"));
    assert.ok(arcLine);
    assert.doesNotMatch(arcLine.slice("mood arc  ".length, "mood arc  ".length + 5), /^ +$/);
  });
});
