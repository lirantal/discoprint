import { join } from "node:path";
import React, { useEffect, useReducer, useState } from "react";
import { Box, Static, Text, useApp } from "ink";
import type { PipelineEvent } from "../pipeline-events.js";
import { slugify } from "../util.js";
import { loadVisualizationData, type VisualizationData } from "../viz/data.js";
import { Dashboard } from "./dashboard/Dashboard.js";
import { DashboardHeader } from "./dashboard/DashboardHeader.js";
import { Header } from "./Header.js";
import { Legend } from "./Legend.js";
import { SongLog } from "./SongLog.js";
import { SpotlightPanel } from "./SpotlightPanel.js";
import { initialState, reduce } from "./state.js";
import { StatsFooter } from "./StatsFooter.js";
import { useSpotlightSequencer } from "./useSpotlightSequencer.js";

const LEFT_WIDTH = 56;
const RIGHT_WIDTH = 44;
const OUTPUT_DIR = join(process.cwd(), "data", "output");

const EXIT_AFTER_STATIC_MS = 150;

export interface AppProps {
  artistQuery: string;
  /** Registers a listener for pipeline events; returns an unsubscribe function. Events emitted before subscribing are replayed. */
  subscribe: (listener: (event: PipelineEvent) => void) => () => void;
  /** Once done, morph into the full dashboard (true) or just a one-line summary (false) — mirrors --no-visualize. */
  showDashboard?: boolean;
}

/**
 * The whole classify experience as one continuous app: a live view while
 * work is happening, which then settles and morphs into the same final
 * dashboard `discoprint visualize` renders (src/tui/dashboard/) — same
 * VisualizationData, same Ink component styling as the live view, committed
 * via <Static> so it survives after this component unmounts. Not a live
 * view that vanishes and hands off to a differently-styled plain-text pass.
 */
export function App({ artistQuery, subscribe, showDashboard = true }: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(reduce, initialState(artistQuery));
  const [finalData, setFinalData] = useState<VisualizationData | null>(null);
  const [finalError, setFinalError] = useState<string | null>(null);
  const { spotlight, caughtUp } = useSpotlightSequencer(state.log, state.totalToClassify);

  useEffect(() => subscribe(dispatch), [subscribe]);

  // Waits for the spotlight to finish playing through every song — not a
  // fixed delay — so a fully-cached run (every completion landing at once)
  // still gets to walk through each result before moving on, the same as a
  // real classify run does; see useSpotlightSequencer's adaptive pacing.
  useEffect(() => {
    if (state.phase !== "done" || !caughtUp) return;
    let cancelled = false;
    const artistName = state.artistName ?? state.artistQuery;

    void (async () => {
      try {
        const data = await loadVisualizationData(OUTPUT_DIR, slugify(artistName), artistName);
        if (!cancelled) setFinalData(data);
      } catch {
        // Shouldn't normally happen right after a successful run — fall
        // back to a plain line rather than hanging on the live view forever.
        if (!cancelled) setFinalError(`Done classifying ${artistName}.`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.phase, caughtUp, state.artistName, state.artistQuery]);

  useEffect(() => {
    if (finalData === null && finalError === null) return;
    const timer = setTimeout(() => exit(), EXIT_AFTER_STATIC_MS);
    return () => clearTimeout(timer);
  }, [finalData, finalError, exit]);

  if (finalData) {
    return (
      <Static items={["final-dashboard"]}>
        {(key) =>
          showDashboard ? <Dashboard key={key} data={finalData} /> : <DashboardHeader key={key} data={finalData} />
        }
      </Static>
    );
  }

  if (finalError) {
    return <Static items={["final-error"]}>{(key) => <Text key={key}>✔ {finalError}</Text>}</Static>;
  }

  return (
    <Box flexDirection="column">
      <Header state={state} />
      <Box marginTop={1}>
        <Box marginRight={1}>
          <SongLog log={state.log} width={LEFT_WIDTH} />
        </Box>
        <SpotlightPanel state={state} spotlight={spotlight} width={RIGHT_WIDTH} />
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
