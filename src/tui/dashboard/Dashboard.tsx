import React from "react";
import { Box, useStdout } from "ink";
import { DashboardHeader } from "./DashboardHeader.js";
import { JevUsageFooter } from "./JevUsageFooter.js";
import { MoodArc } from "./MoodArc.js";
import { SongsPanel } from "./SongsPanel.js";
import { ThemeOverview } from "./ThemeOverview.js";
import type { VisualizationData } from "../../viz/data.js";

const MAX_WIDTH = 120;
// Rows spent on chrome around the songs panel: header, mood arc, theme
// overview (2 lines), footer, and the spacing between them — matches
// src/viz/render-terminal.ts's own reserved-row accounting.
const RESERVED_ROWS = 10;

/**
 * The full report — same content and same underlying VisualizationData as
 * src/viz/render-terminal.ts's plain-text dashboard (and `discoprint
 * visualize`), rendered as Ink components instead of ANSI-embedded strings
 * so the live classify view can settle into this without a change in
 * visual language.
 */
export function Dashboard({ data }: { data: VisualizationData }): React.JSX.Element {
  const { stdout } = useStdout();
  const width = Math.max(40, Math.min(MAX_WIDTH, stdout.columns ?? 80));
  const height = Math.max(10, stdout.rows ?? 24);
  const maxRows = Math.max(3, height - RESERVED_ROWS);

  return (
    <Box flexDirection="column">
      <DashboardHeader data={data} />
      <Box marginTop={1} flexDirection="column">
        <MoodArc data={data} width={width} />
        <Box marginTop={1}>
          <ThemeOverview data={data} width={width} />
        </Box>
      </Box>
      <Box marginTop={1}>
        <SongsPanel data={data} width={width} maxRows={maxRows} />
      </Box>
      <Box marginTop={1}>
        <JevUsageFooter data={data} />
      </Box>
    </Box>
  );
}
