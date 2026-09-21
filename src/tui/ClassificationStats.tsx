import React from "react";
import { Box, Text } from "ink";
import { StatBar } from "./StatBar.js";
import {
  CLASSIFICATION_STAT_SPECS,
  STAT_LABEL_WIDTH,
  type ClassificationStatValues,
} from "../viz/classification-averages.js";
import { themeColor } from "../viz/theme-palette.js";

export interface ClassificationStatsProps {
  /** The theme to name on the first row: a single song's, or the discography's most common one. */
  theme: string;
  /** The number beside the theme name: that song's confidence, or the mean confidence across the discography. */
  themeConfidence: number;
  values: ClassificationStatValues;
  /** 0..1 reveal factor for the spotlight's fill-in animation. Omit for an already-settled value. */
  progress?: number;
}

/**
 * The five-row classification readout — theme, then a bar per numeric
 * attribute. Rendered identically whether it's describing one song as it
 * lands (SpotlightPanel) or the whole discography averaged
 * (dashboard/AveragesPanel), so the live view can settle into the final
 * report without the panel changing shape under the reader.
 */
export function ClassificationStats({
  theme,
  themeConfidence,
  values,
  progress = 1,
}: ClassificationStatsProps): React.JSX.Element {
  const { hex, label } = themeColor(theme);

  return (
    <Box flexDirection="column">
      <Box>
        <Box width={STAT_LABEL_WIDTH}>
          <Text dimColor>theme</Text>
        </Box>
        <Text color={hex}>{label}</Text>
        <Text dimColor> {(themeConfidence * progress).toFixed(2)}</Text>
      </Box>
      {CLASSIFICATION_STAT_SPECS.map((spec) => (
        <StatBar
          key={spec.key}
          label={spec.label}
          value={values[spec.key]}
          max={spec.max}
          progress={progress}
          color={spec.hex}
        />
      ))}
    </Box>
  );
}
