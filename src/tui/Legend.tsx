import React from "react";
import { Box, Text } from "ink";
import { themeColor } from "../viz/theme-palette.js";
import type { CompletedSong } from "./types.js";

/** Theme swatches for whatever's actually appeared so far, most common first — mirrors the final dashboard's own legend. */
export function Legend({ log }: { log: CompletedSong[] }): React.JSX.Element | null {
  if (log.length === 0) return null;

  const counts = new Map<string, number>();
  for (const song of log) {
    counts.set(song.classification.theme, (counts.get(song.classification.theme) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <Box marginTop={1}>
      <Text dimColor>themes </Text>
      {entries.map(([theme, count], i) => {
        const { hex, label } = themeColor(theme);
        return (
          <Text key={theme}>
            <Text color={hex}>██</Text>{" "}
            <Text dimColor>
              {label} {count}
            </Text>
            {i < entries.length - 1 ? "   " : ""}
          </Text>
        );
      })}
    </Box>
  );
}
