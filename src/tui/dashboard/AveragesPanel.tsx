import React from "react";
import { Box, Text } from "ink";
import { ClassificationStats } from "../ClassificationStats.js";
import {
  AVERAGES_PANEL_TITLE,
  averagesSubtitle,
  computeClassificationAverages,
} from "../../viz/classification-averages.js";
import type { VisualizationData } from "../../viz/data.js";

/**
 * The settled counterpart to the live view's JUST CLASSIFIED spotlight: the
 * same five rows, in the same component, at the same width and the same
 * place on screen — only averaged across every song instead of describing
 * the one that just landed. Rendering it here is what lets the live view
 * settle into the dashboard without the right-hand column moving, resizing,
 * or disappearing; it just stops naming a single song and starts naming the
 * whole discography.
 */
export function AveragesPanel({ data, width }: { data: VisualizationData; width: number }): React.JSX.Element | null {
  const averages = computeClassificationAverages(data);
  if (!averages) return null;

  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" width={width} paddingX={1}>
      <Text bold>{AVERAGES_PANEL_TITLE}</Text>
      <Text dimColor>{averagesSubtitle(averages)}</Text>
      <Box marginTop={1}>
        <ClassificationStats
          theme={averages.topTheme.theme}
          themeConfidence={averages.themeConfidence}
          values={averages.values}
        />
      </Box>
    </Box>
  );
}
