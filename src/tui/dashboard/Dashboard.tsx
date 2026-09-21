import React from "react";
import { Box, useStdout } from "ink";
import { DashboardHeader } from "./DashboardHeader.js";
import { DiscographyPanel } from "./DiscographyPanel.js";
import { JevUsageFooter } from "./JevUsageFooter.js";
import { OverviewPanel } from "./OverviewPanel.js";
import { SongsPanel } from "./SongsPanel.js";
import { discographyPanelRowCount } from "../../viz/discography-grid.js";
import type { VisualizationData } from "../../viz/data.js";

const MAX_WIDTH = 120;
// 1 char of border + 1 char of paddingX on each side — matches every
// panel's own local BOX_CHROME_WIDTH; needed here to size the discography
// grid's row-count estimate off the same content width it actually renders at.
const BOX_CHROME_WIDTH = 4;
// Rows spent on chrome around the songs panel: header, overview panel
// (border + mood arc + spacing + theme lines), footer, and the spacing
// between them — matches src/viz/render-terminal.ts's own reserved-row
// accounting, just adjusted for the overview panel's own border rows.
const RESERVED_ROWS = 12;

/**
 * The full report — same content and same underlying VisualizationData as
 * src/viz/render-terminal.ts's plain-text dashboard (and `discoprint
 * visualize`), rendered as Ink components instead of ANSI-embedded strings
 * so the live classify view can settle into this without a change in
 * visual language: an OVERVIEW panel and a SONGS panel, the same boxed
 * family as the live view's own SongLog/SpotlightPanel.
 */
export function Dashboard({ data }: { data: VisualizationData }): React.JSX.Element {
  const { stdout } = useStdout();
  const width = Math.max(40, Math.min(MAX_WIDTH, stdout.columns ?? 80));
  const height = Math.max(10, stdout.rows ?? 24);
  const discographyRows = discographyPanelRowCount(data.songs.length, width - BOX_CHROME_WIDTH) + 1; // + the marginTop Box wrapping the panel below
  const maxRows = Math.max(3, height - RESERVED_ROWS - discographyRows);

  return (
    <Box flexDirection="column">
      <DashboardHeader data={data} />
      <Box marginTop={1}>
        <OverviewPanel data={data} width={width} />
      </Box>
      <Box marginTop={1}>
        <DiscographyPanel data={data} width={width} />
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
