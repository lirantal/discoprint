import React from "react";
import { Box, Text } from "ink";
import { themeMixSegments } from "./bars.js";
import { THEME_PALETTE, themeColor } from "../../viz/theme-palette.js";
import type { VisualizationData } from "../../viz/data.js";

const TOTAL_POSSIBLE_THEMES = Object.keys(THEME_PALETTE).length;
// So the legend and the mix bar below it start their content at the same
// column, regardless of how many themes appear (see `N` in "(N/8)").
const LABEL_WIDTH =
  Math.max("theme mix".length, `themes (${TOTAL_POSSIBLE_THEMES}/${TOTAL_POSSIBLE_THEMES})`.length) + 1;

/** Which themes appear (out of the 8 possible), their share, and the same proportions as a stacked bar. */
export function ThemeOverview({ data, width }: { data: VisualizationData; width: number }): React.JSX.Element | null {
  if (data.themeDistribution.length === 0) return null;

  const label = `themes (${data.themeDistribution.length}/${TOTAL_POSSIBLE_THEMES})`.padEnd(LABEL_WIDTH);
  const barWidth = Math.min(50, Math.max(10, width - 14));
  const segments = themeMixSegments(data.themeDistribution, data.songs.length, barWidth);

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>{label}</Text>
        <Box flexWrap="wrap" width={Math.max(20, width - LABEL_WIDTH)}>
          {data.themeDistribution.map(({ theme, percentage }) => {
            const { hex, label: themeLabel } = themeColor(theme);
            return (
              <Box key={theme} marginRight={3}>
                <Text color={hex}>██</Text>
                <Text dimColor>
                  {" "}
                  {themeLabel} {Math.round(percentage)}%
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
      <Text>
        <Text dimColor>{"theme mix".padEnd(LABEL_WIDTH)}</Text>
        {segments.map((segment, i) => (
          <Text key={i} color={segment.hex}>
            {"█".repeat(segment.width)}
          </Text>
        ))}
      </Text>
    </Box>
  );
}
