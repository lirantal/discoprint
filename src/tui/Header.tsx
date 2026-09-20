import React from "react";
import { Box, Text } from "ink";
import { useElapsedMs, useSpinnerFrame } from "./hooks.js";
import type { AppState } from "./state.js";

function phaseLabel(state: AppState): string {
  switch (state.phase) {
    case "resolving-artist":
      return `Resolving "${state.artistQuery}"…`;
    case "fetching-discography":
      return state.discographyProgress
        ? `Fetching discography… (${state.discographyProgress.done}/${state.discographyProgress.total} releases)`
        : "Fetching discography…";
    case "fetching-lyrics":
      return state.lyricsProgress
        ? `Fetching lyrics… (${state.lyricsProgress.done}/${state.lyricsProgress.total})`
        : "Fetching lyrics…";
    case "classifying":
      return `Classifying songs… (${state.runningCount}/${state.totalToClassify})`;
    case "done":
      return "Done";
    case "error":
      return "Failed";
  }
}

/** Top status bar: artist identity on the left, live phase + elapsed time on the right. */
export function Header({ state }: { state: AppState }): React.JSX.Element {
  const active = state.phase !== "done" && state.phase !== "error";
  const spinner = useSpinnerFrame(active);
  const elapsedMs = useElapsedMs(active);
  const title = state.artistName ?? state.artistQuery;
  const suffix = state.disambiguation ? ` (${state.disambiguation})` : "";
  const icon = active ? spinner : state.phase === "done" ? "✔" : "✖";

  return (
    <Box justifyContent="space-between">
      <Text>
        <Text bold color="#22d3ee">
          discoprint
        </Text>{" "}
        <Text bold>
          {title}
          {suffix}
        </Text>
      </Text>
      <Text dimColor>
        {icon} {phaseLabel(state)} · {(elapsedMs / 1000).toFixed(1)}s
      </Text>
    </Box>
  );
}
