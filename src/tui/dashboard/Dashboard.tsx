import React from "react";
import { Box, useStdout } from "ink";
import { AveragesPanel } from "./AveragesPanel.js";
import { DashboardHeader } from "./DashboardHeader.js";
import { DiscographyPanel } from "./DiscographyPanel.js";
import { JevUsageFooter } from "./JevUsageFooter.js";
import { OverviewPanel } from "./OverviewPanel.js";
import { SongsPanel } from "./SongsPanel.js";
import { BOX_CHROME_WIDTH, COLUMN_GAP, splitColumns, useTerminalWidth } from "../layout.js";
import { discographyPanelRowCount } from "../../viz/discography-grid.js";
import type { VisualizationData } from "../../viz/data.js";

// Rows spent on everything that isn't a SONGS row: the header, the
// overview/averages row, the songs panel's own border + title, the footer,
// and the blank line between each — matches src/viz/render-terminal.ts's own
// reserved-row accounting, adjusted for the bordered panels' extra rows.
// (The discography panel's height is measured separately, since it grows
// with the song count.)
const RESERVED_ROWS = 13;

/**
 * The full report — same content and same underlying VisualizationData as
 * src/viz/render-terminal.ts's plain-text dashboard (and `discoprint
 * visualize`), rendered as Ink components instead of ANSI-embedded strings
 * so the live classify view can settle into this without a change in
 * visual language.
 *
 * The top row deliberately mirrors the live view's own two-column split
 * (src/tui/App.tsx): a wide left column, and a fixed-width right-hand panel
 * at the exact same width and offset. While classifying, that right panel
 * is the JUST CLASSIFIED spotlight; once settled, it's the same five rows
 * averaged across the whole discography. Same geometry on both sides of the
 * transition means no layout shift at the moment the run finishes.
 */
export function Dashboard({ data }: { data: VisualizationData }): React.JSX.Element {
  const { stdout } = useStdout();
  const width = useTerminalWidth();
  const height = Math.max(10, stdout?.rows || 24);
  const { main, side } = splitColumns(width);

  const discographyRows = discographyPanelRowCount(data.songs.length, width - BOX_CHROME_WIDTH) + 1; // + the marginTop Box wrapping the panel below
  const maxRows = Math.max(3, height - RESERVED_ROWS - discographyRows);

  return (
    <Box flexDirection="column">
      <DashboardHeader data={data} />
      {side === null ? (
        <>
          <Box marginTop={1}>
            <OverviewPanel data={data} width={width} />
          </Box>
          <Box marginTop={1}>
            <AveragesPanel data={data} width={width} />
          </Box>
        </>
      ) : (
        <Box marginTop={1}>
          <Box marginRight={COLUMN_GAP}>
            <OverviewPanel data={data} width={main} />
          </Box>
          <AveragesPanel data={data} width={side} />
        </Box>
      )}
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
