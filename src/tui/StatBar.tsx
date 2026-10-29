import React from "react";
import { Box, Text } from "ink";
import { STAT_BAR_WIDTH, STAT_LABEL_WIDTH, statBarFill } from "../viz/classification-averages.js";

function block(filledWidth: number, width: number): string {
  return `${"█".repeat(filledWidth)}${"░".repeat(width - filledWidth)}`;
}

export interface StatBarProps {
  label: string;
  value: number;
  max: number;
  /** 0..1 — how much of `value` to reveal, for the spotlight's fill-in animation. 1 for an already-settled value. */
  progress: number;
  color: string;
}

/** A labeled `label ████░░░░ 1.23` row — one classified attribute, in the live spotlight and in the settled averages panel alike. */
export function StatBar({ label, value, max, progress, color }: StatBarProps): React.JSX.Element {
  const shown = value * progress;

  return (
    <Box>
      <Box width={STAT_LABEL_WIDTH}>
        <Text dimColor>{label}</Text>
      </Box>
      <Text color={color}>{block(statBarFill(shown, max), STAT_BAR_WIDTH)}</Text>
      <Text dimColor> {shown.toFixed(2)}</Text>
    </Box>
  );
}
