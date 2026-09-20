import React from "react";
import { Box, Text } from "ink";
import { themeColor } from "../viz/theme-palette.js";
import type { CompletedSong } from "./types.js";

// Once the log outgrows this, it stops adding new terminal lines and starts
// scrolling instead — the whole point being that a 200-song run renders the
// same frame size as a 5-song one, not a scrollback-filling wall of text.
const VISIBLE_ROWS = 10;

function truncate(text: string, width: number): string {
  if (text.length <= width) return text.padEnd(width);
  return `${text.slice(0, Math.max(1, width - 1))}…`;
}

export function SongLog({ log, width }: { log: CompletedSong[]; width: number }): React.JSX.Element {
  const hiddenCount = Math.max(0, log.length - VISIBLE_ROWS);
  const visible = log.slice(-VISIBLE_ROWS);
  const titleWidth = Math.max(10, width - 20);

  return (
    <Box borderStyle="round" borderColor="gray" flexDirection="column" width={width} paddingX={1}>
      <Text bold>SONGS{log.length > 0 ? ` (${log.length})` : ""}</Text>
      {hiddenCount > 0 && <Text dimColor>↑ {hiddenCount} earlier</Text>}
      {visible.length === 0 && <Text dimColor>Waiting for the first result…</Text>}
      {visible.map((song) => {
        const { hex } = themeColor(song.classification.theme);
        return (
          <Text key={song.id}>
            <Text color={hex}>██</Text> {truncate(song.title, titleWidth)}{" "}
            <Text dimColor>mood {song.classification.mood.toFixed(1)}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
