import React from "react";
import { Box, Text } from "ink";
import {
  computeDiscographyStats,
  GRID_CELL_WIDTH,
  gridColumns,
  gridRows,
  hiddenSongCount,
} from "../../viz/discography-grid.js";
import { themeColor } from "../../viz/theme-palette.js";
import type { VisualizationData } from "../../viz/data.js";

// 1 char of border + 1 char of paddingX on each side, matching the other
// dashboard panels' own BOX_CHROME_WIDTH.
const BOX_CHROME_WIDTH = 4;

/**
 * A GitHub-contributions-style grid: one swatch per classified song in
 * chronological order, colored by theme, wrapping to fill `width` — plus a
 * row of at-a-glance stat chips above it. Sits between the OVERVIEW and
 * SONGS panels, its own boxed section in the same visual family.
 */
export function DiscographyPanel({
  data,
  width,
}: {
  data: VisualizationData;
  width: number;
}): React.JSX.Element | null {
  if (data.songs.length === 0) return null;

  const contentWidth = Math.max(20, width - BOX_CHROME_WIDTH);
  const stats = computeDiscographyStats(data);

  const columns = gridColumns(contentWidth, GRID_CELL_WIDTH);
  const rows = gridRows(data.songs, columns);
  const hidden = hiddenSongCount(data.songs.length, columns);

  return (
    <Box borderStyle="round" borderColor="gray" flexDirection="column" width={width} paddingX={1}>
      <Text bold>DISCOGRAPHY</Text>
      <Box marginTop={1} flexWrap="wrap" width={contentWidth}>
        {stats.map((stat, i) => (
          <Box key={stat.label} marginRight={i < stats.length - 1 ? 3 : 0}>
            <Text dimColor>{stat.label} </Text>
            <Text bold>{stat.value}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>song grid (chronological, colored by theme)</Text>
        {rows.map((row, i) => (
          <Text key={i}>
            {row.map((song, j) => (
              <Text key={j} color={themeColor(song.theme).hex}>
                {"██"}
                {j < row.length - 1 ? " " : ""}
              </Text>
            ))}
          </Text>
        ))}
        {hidden > 0 && <Text dimColor>+ {hidden} more not shown</Text>}
      </Box>
    </Box>
  );
}
