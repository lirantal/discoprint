import React from "react";
import { Box, Text } from "ink";
import { albumStrip, complexityGlyph, formatYear, moodBar } from "./bars.js";
import { themeColor } from "../../viz/theme-palette.js";
import type { AlbumGroup, VisualizationData } from "../../viz/data.js";
import type { SongClassification } from "../../types.js";

const MOOD_MAX = 4;
const MOOD_BAR_WIDTH = 6;
const ALBUM_STRIP_WIDTH = 20;
// 1 char of border + 1 char of paddingX on each side — the gap between the
// box's own `width` prop (its outer size) and how much a row can actually
// use before Ink wraps it onto a second line.
const BOX_CHROME_WIDTH = 4;

function truncate(text: string, width: number): string {
  if (text.length <= width) return text.padEnd(width);
  return `${text.slice(0, Math.max(1, width - 1))}…`;
}

function SongRow({ song, titleWidth }: { song: SongClassification; titleWidth: number }): React.JSX.Element {
  const { hex } = themeColor(song.theme);
  const bar = moodBar(song.mood, MOOD_MAX, MOOD_BAR_WIDTH);
  return (
    <Text>
      <Text color={hex}>██</Text> <Text dimColor>{formatYear(song.releaseDate)}</Text>{" "}
      {truncate(song.track, titleWidth)} <Text color={bar.color}>{bar.filled}</Text>
      <Text dimColor>{bar.empty}</Text> <Text dimColor>{complexityGlyph(song.complexity)}</Text>
    </Text>
  );
}

function AlbumRow({ album, titleWidth }: { album: AlbumGroup; titleWidth: number }): React.JSX.Element {
  const bar = moodBar(album.avgMood, MOOD_MAX, MOOD_BAR_WIDTH);
  const strip = albumStrip(album, ALBUM_STRIP_WIDTH);
  return (
    <Text>
      <Text dimColor>{formatYear(album.releaseDate)}</Text> {truncate(album.album, titleWidth)}{" "}
      {strip.map((c, i) => (
        <Text key={i} color={c.color} dimColor={c.dim}>
          {c.char}
        </Text>
      ))}{" "}
      <Text color={bar.color}>{bar.filled}</Text>
      <Text dimColor>{bar.empty}</Text> <Text dimColor>{complexityGlyph(album.avgComplexity)}</Text>{" "}
      <Text dimColor>({String(album.songs.length).padStart(2)})</Text>
    </Text>
  );
}

/**
 * Adaptive, same as src/viz/render-terminal.ts: one row per song when it
 * fits within `maxRows`, otherwise one row per album — so a 200-song
 * discography still renders as a compact, readable block.
 */
export function SongsPanel({
  data,
  width,
  maxRows,
}: {
  data: VisualizationData;
  width: number;
  maxRows: number;
}): React.JSX.Element {
  const usePerSong = data.songs.length > 0 && data.songs.length <= maxRows;
  const contentWidth = Math.max(20, width - BOX_CHROME_WIDTH);
  const titleWidth = Math.max(10, contentWidth - (usePerSong ? 18 : 38));

  return (
    <Box borderStyle="round" borderColor="gray" flexDirection="column" width={width} paddingX={1}>
      <Text bold>SONGS{data.songs.length > 0 ? ` (${data.songs.length})` : ""}</Text>
      {data.songs.length === 0 && <Text dimColor>No classified songs yet.</Text>}
      {usePerSong && data.songs.map((song, i) => <SongRow key={i} song={song} titleWidth={titleWidth} />)}
      {!usePerSong &&
        data.songs.length > 0 &&
        data.albums.map((album, i) => <AlbumRow key={i} album={album} titleWidth={titleWidth} />)}
    </Box>
  );
}
