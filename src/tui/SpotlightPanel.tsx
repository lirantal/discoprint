import React from "react";
import { Box, Text } from "ink";
import { ClassificationStats } from "./ClassificationStats.js";
import { useSpinnerFrame } from "./hooks.js";
import { BOX_CHROME_WIDTH } from "./layout.js";
import type { ClassificationStatValues } from "../viz/classification-averages.js";
import type { AppState } from "./state.js";
import type { Spotlight as SpotlightData } from "./useSpotlightSequencer.js";

function truncate(text: string, width: number): string {
  if (text.length <= width) return text;
  return `${text.slice(0, Math.max(1, width - 1))}…`;
}

// Rendered instead of a real spotlight's classification before the first
// result lands, at progress 0 (all bars empty) — so the stats block always
// occupies its usual rows and the panel doesn't grow by several lines the
// moment the first song reveals.
const PLACEHOLDER_STAT_VALUES: ClassificationStatValues = { mood: 0, complexity: 0, explicit: 0, firstPerson: 0 };

/** Right panel: the most recently classified song's stats revealing in, plus a compact list of what's still in flight. */
export function SpotlightPanel({
  state,
  spotlight,
  width,
}: {
  state: AppState;
  spotlight: SpotlightData | null;
  width: number;
}): React.JSX.Element {
  const inFlightEntries = [...state.inFlight.entries()];
  const spinner = useSpinnerFrame(inFlightEntries.length > 0);

  const title = spotlight ? "JUST CLASSIFIED" : state.phase === "classifying" ? "CLASSIFYING" : "RESULT";
  const contentWidth = Math.max(10, width - BOX_CHROME_WIDTH);

  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" width={width} paddingX={1}>
      <Text bold>{title}</Text>

      <Text dimColor={!spotlight}>
        {spotlight ? truncate(spotlight.song.title, contentWidth) : truncate("Waiting for the first result…", contentWidth)}
      </Text>
      <Box marginTop={1}>
        <ClassificationStats
          theme={spotlight?.song.classification.theme ?? ""}
          themeConfidence={spotlight?.song.classification.themeConfidence ?? 0}
          values={spotlight?.song.classification ?? PLACEHOLDER_STAT_VALUES}
          progress={spotlight?.progress ?? 0}
        />
      </Box>

      {state.maxInFlight > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>in flight ({inFlightEntries.length})</Text>
          {/* Padded to maxInFlight (the concurrency high-water mark) rather
              than inFlightEntries.length, so this block holds a constant
              height as songs start and finish instead of growing and
              shrinking on every event. */}
          {Array.from({ length: state.maxInFlight }, (_, i) => inFlightEntries[i]).map((entry, i) => (
            <Text key={entry?.[0] ?? `empty-${i}`} dimColor>
              {entry ? `${spinner} ${entry[1]}` : " "}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
