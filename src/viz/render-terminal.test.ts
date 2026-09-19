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
    for (const line of lines) assert.ok(stripAnsi(line).length <= 60 + 5); // small slack for edge rounding
  });

  await t.test("respects an explicit width narrower than the default", () => {
    const data = buildVisualizationData("Test Artist", makeSongs(3), 0);
    const wide = renderTerminal(data, { width: 100, height: 24, colorEnabled: false });
    const narrow = renderTerminal(data, { width: 50, height: 24, colorEnabled: false });
    assert.notDeepEqual(wide, narrow);
  });
});
