import React from "react";
import { Box, Text } from "ink";
import { MoodArc } from "./MoodArc.js";
import { ThemeOverview } from "./ThemeOverview.js";
import type { VisualizationData } from "../../viz/data.js";

// 1 char of border + 1 char of paddingX on each side (matches SongsPanel's
// own BOX_CHROME_WIDTH) — the gap between this box's outer `width` and how
// much its children can actually use before wrapping.
const BOX_CHROME_WIDTH = 4;

/** Mood arc + theme legend/mix, boxed to match the SONGS panel's visual family instead of sitting as bare lines. */
export function OverviewPanel({ data, width }: { data: VisualizationData; width: number }): React.JSX.Element {
  const contentWidth = Math.max(20, width - BOX_CHROME_WIDTH);

  return (
    <Box borderStyle="round" borderColor="gray" flexDirection="column" width={width} paddingX={1}>
      <Text bold>OVERVIEW</Text>
      <Box marginTop={1} flexDirection="column">
        <MoodArc data={data} width={contentWidth} />
        <Box marginTop={1}>
          <ThemeOverview data={data} width={contentWidth} />
        </Box>
      </Box>
    </Box>
  );
}
