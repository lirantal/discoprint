import React from "react";
import { Box, Text } from "ink";
import { formatTokenCount, formatUsd } from "../format.js";
import { estimateCostUsd } from "../jev.js";
import type { AppState } from "./state.js";

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
        {formatTokenCount(state.runningTokens.input)} in / {formatTokenCount(state.runningTokens.output)} out tok · ~
        {formatUsd(estimateCostUsd(state.runningTokens.input))}
      </Text>
    </Box>
  );
}
