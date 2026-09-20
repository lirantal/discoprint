import React from "react";
import { Text } from "ink";
import { formatDuration, formatTokenCount, formatUsd } from "../../format.js";
import type { VisualizationData } from "../../viz/data.js";

/** Stats from the most recent classify run: song count, model, tokens, cost, and time spent classifying. */
export function JevUsageFooter({ data }: { data: VisualizationData }): React.JSX.Element | null {
  const meta = data.lastRunMeta;
  if (!meta) return null;

  if (meta.songsClassifiedThisRun === 0) {
    // A plain string constant, not inline JSX text — a formatter is free to
    // collapse consecutive spaces inside JSX text (prettier does), which
    // silently ate one of these two intentional spaces once already.
    const fullyCachedLine = "jev usage  fully cached — no new Jev calls on the last run";
    return <Text dimColor>{fullyCachedLine}</Text>;
  }

  const summary = [
    `${meta.songsClassifiedThisRun} song${meta.songsClassifiedThisRun === 1 ? "" : "s"} classified`,
    meta.model ?? "unknown model",
    `${formatTokenCount(meta.tokens.input)} in / ${formatTokenCount(meta.tokens.output)} out tok`,
  ].join(" · ");
  // Built as plain strings (not split across JSX lines) so whitespace is
  // exact — JSX collapses/inserts spaces around line breaks between
  // expressions, which is easy to get subtly wrong here.
  const prefix = `jev usage  ${summary} · ~`;
  const suffix = ` · ${formatDuration(meta.durationMs.classification)} classifying`;

  return (
    <Text dimColor>
      {prefix}
      <Text color="#22c55e">{formatUsd(meta.estimatedCostUsd)}</Text>
      {suffix}
    </Text>
  );
}
