import React from "react";
import { Box, Text } from "ink";
import { estimateCostUsd } from "../jev.js";
import type { AppState } from "./state.js";

function formatUsd(amountUsd: number): string {
  if (amountUsd === 0) return "$0.00";
  return amountUsd < 0.01 ? `$${amountUsd.toFixed(4)}` : `$${amountUsd.toFixed(2)}`;
}

/** Bottom aggregate bar: running (or final) counts, tokens, and estimated cost. */
export function StatsFooter({ state }: { state: AppState }): React.JSX.Element {
  const total = state.totalToClassify || state.log.length;
  const skippedSuffix = state.skippedCount ? ` · ${state.skippedCount} skipped` : "";

  return (
    <Box justifyContent="space-between" marginTop={1}>
      <Text dimColor>
        {state.log.length}/{total} classified{skippedSuffix}
      </Text>
      <Text dimColor>
        {state.runningTokens.input} in / {state.runningTokens.output} out tok · ~
        {formatUsd(estimateCostUsd(state.runningTokens.input))}
      </Text>
    </Box>
  );
}
