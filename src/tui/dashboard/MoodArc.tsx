import React from "react";
import { Text } from "ink";
import { moodArcSeries, moodScaleRamp } from "./bars.js";
import type { VisualizationData } from "../../viz/data.js";

const LABEL = "mood arc  ";
const SEPARATOR = "  │  ";
const SCALE_PREFIX = "( sad ";
const SCALE_SUFFIX = " upbeat)";

/** One line, whole discography: a colored mood sparkline plus its own gradient as a "how to read this" key. */
export function MoodArc({ data, width }: { data: VisualizationData; width: number }): React.JSX.Element {
  if (data.songs.length === 0) {
    return <Text dimColor>{LABEL}(no data)</Text>;
  }

  const ramp = moodScaleRamp();
  const scaleLength = SCALE_PREFIX.length + ramp.length + SCALE_SUFFIX.length;
  const reserved = LABEL.length + SEPARATOR.length + scaleLength;
  const series = moodArcSeries(data.songs, width - reserved);

  return (
    <Text>
      <Text dimColor>{LABEL}</Text>
      {series.map((point, i) => (
        <Text key={i} color={point.color}>
          {point.char}
        </Text>
      ))}
      <Text dimColor>{SEPARATOR}</Text>
      <Text dimColor>{SCALE_PREFIX}</Text>
      {ramp.map((point, i) => (
        <Text key={i} color={point.color}>
          {point.char}
        </Text>
      ))}
      <Text dimColor>{SCALE_SUFFIX}</Text>
    </Text>
  );
}
