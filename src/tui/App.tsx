import React, { useEffect, useReducer } from "react";
import { Box, Text, useApp } from "ink";
import type { PipelineEvent } from "../pipeline-events.js";
import { Header } from "./Header.js";
import { Legend } from "./Legend.js";
import { SongLog } from "./SongLog.js";
import { SpotlightPanel } from "./SpotlightPanel.js";
import { initialState, reduce } from "./state.js";
import { StatsFooter } from "./StatsFooter.js";

const LEFT_WIDTH = 56;
const RIGHT_WIDTH = 44;

export interface AppProps {
  artistQuery: string;
  /** Registers a listener for pipeline events; returns an unsubscribe function. Events emitted before subscribing are replayed. */
  subscribe: (listener: (event: PipelineEvent) => void) => () => void;
  /** How long to hold the final frame on screen before exiting, so "done" is actually readable. */
  doneLingerMs?: number;
}

/** The live classify view: one status header, a two-panel body, a legend, and an aggregate footer. */
export function App({ artistQuery, subscribe, doneLingerMs = 900 }: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(reduce, initialState(artistQuery));

  useEffect(() => subscribe(dispatch), [subscribe]);

  useEffect(() => {
    if (state.phase !== "done" && state.phase !== "error") return;
    const timer = setTimeout(() => exit(), doneLingerMs);
    return () => clearTimeout(timer);
  }, [state.phase, exit, doneLingerMs]);

  return (
    <Box flexDirection="column">
      <Header state={state} />
      <Box marginTop={1}>
        <Box marginRight={1}>
          <SongLog log={state.log} width={LEFT_WIDTH} />
        </Box>
        <SpotlightPanel state={state} width={RIGHT_WIDTH} />
      </Box>
      <Legend log={state.log} />
      <StatsFooter state={state} />
      {state.phase === "error" && state.errorMessage && (
        <Box marginTop={1}>
          <Text color="#f87171">✖ {state.errorMessage}</Text>
        </Box>
      )}
    </Box>
  );
}
