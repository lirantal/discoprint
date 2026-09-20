import React from "react";
import { Box, Text } from "ink";
import { themeColor } from "../viz/theme-palette.js";
import { useSpinnerFrame } from "./hooks.js";
import { StatBar } from "./StatBar.js";
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
          <Box marginTop={1} flexDirection="column">
            <Box>
              <Box width={12}>
                <Text dimColor>theme</Text>
              </Box>
              <Text color={themeColor(spotlight.song.classification.theme).hex}>
                {themeColor(spotlight.song.classification.theme).label}
              </Text>
              <Text dimColor> {(spotlight.song.classification.themeConfidence * spotlight.progress).toFixed(2)}</Text>
            </Box>
            <StatBar label="mood" value={spotlight.song.classification.mood} max={4} progress={spotlight.progress} color="#22c55e" />
            <StatBar
              label="complexity"
              value={spotlight.song.classification.complexity}
              max={3}
              progress={spotlight.progress}
              color="#a78bfa"
            />
            <StatBar
              label="explicit"
              value={spotlight.song.classification.explicit}
              max={1}
              progress={spotlight.progress}
              color="#f87171"
            />
            <StatBar
              label="1st person"
              value={spotlight.song.classification.firstPerson}
              max={1}
              progress={spotlight.progress}
              color="#60a5fa"
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
