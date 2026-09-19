import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVisualizationData } from "./data.js";
import { renderTerminal } from "./render-terminal.js";
import type { SongClassification } from "../types.js";

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
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
      theme: ["love", "heartbreak", "party_fun"][i % 3],
      themeConfidence: 0.8,
      mood: (i % 5),
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
    const lines = renderTerminal(data, { width: 80, height: 30, colorEnabled: false });
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
    const data = buildVisualizationData("Test Artist", [{ ...makeSongs(1)[0], track: longTitle }], 0);
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
