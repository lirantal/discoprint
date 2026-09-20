import React from "react";
import { Box, Text } from "ink";

const BAR_WIDTH = 16;
const LABEL_WIDTH = 12;

function block(filledWidth: number, width: number): string {
  const clamped = Math.max(0, Math.min(width, filledWidth));
  return `${"█".repeat(clamped)}${"░".repeat(width - clamped)}`;
}

export interface StatBarProps {
  label: string;
  value: number;
  max: number;
  /** 0..1 — how much of `value` to reveal, for the spotlight's fill-in animation. 1 for an already-settled value. */
  progress: number;
  color: string;
}

/** A labeled `label ████░░░░ 1.23` row, reused by the spotlight panel for each classified attribute. */
export function StatBar({ label, value, max, progress, color }: StatBarProps): React.JSX.Element {
  const shown = value * progress;
  const filled = Math.round((shown / max) * BAR_WIDTH);

  return (
    <Box>
      <Box width={LABEL_WIDTH}>
        <Text dimColor>{label}</Text>
      </Box>
      <Text color={color}>{block(filled, BAR_WIDTH)}</Text>
      <Text dimColor> {shown.toFixed(2)}</Text>
    </Box>
  );
}
