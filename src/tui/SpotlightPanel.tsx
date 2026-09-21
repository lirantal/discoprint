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

      {inFlightEntries.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>in flight ({inFlightEntries.length})</Text>
          {inFlightEntries.map(([id, songTitle]) => (
            <Text key={id} dimColor>
              {spinner} {songTitle}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
