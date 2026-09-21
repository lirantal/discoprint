import React from "react";
import { Box, Text } from "ink";
import { ClassificationStats } from "./ClassificationStats.js";
import { useSpinnerFrame } from "./hooks.js";
import type { AppState } from "./state.js";
import type { Spotlight as SpotlightData } from "./useSpotlightSequencer.js";

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

  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" width={width} paddingX={1}>
      <Text bold>{title}</Text>

      {spotlight ? (
        <>
          <Text>{spotlight.song.title}</Text>
          <Box marginTop={1}>
            <ClassificationStats
              theme={spotlight.song.classification.theme}
              themeConfidence={spotlight.song.classification.themeConfidence}
              values={spotlight.song.classification}
              progress={spotlight.progress}
            />
          </Box>
        </>
      ) : (
        <Text dimColor>Waiting for the first result…</Text>
      )}

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
