import React from "react";
import { Text } from "ink";
import { formatYear } from "./bars.js";
import type { VisualizationData } from "../../viz/data.js";

/** The `◆  Artist  — N songs classified · year–year` summary line — the same content src/viz/render-terminal.ts's renderHeader() produces, just as Ink text. */
export function DashboardHeader({ data }: { data: VisualizationData }): React.JSX.Element {
  const parts = [`${data.songs.length} songs classified`];
  if (data.skippedCount > 0) parts.push(`${data.skippedCount} skipped`);
  const { from, to } = data.dateRange;
  if (from) parts.push(from === to ? formatYear(from) : `${formatYear(from)}–${formatYear(to)}`);

  return (
    <Text>
      <Text color="#22d3ee">◆</Text>
      {"  "}
      <Text bold>{data.artist}</Text>
      {"  "}
      <Text dimColor>— {parts.join(" · ")}</Text>
    </Text>
  );
}
