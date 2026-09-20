import { join } from "node:path";
import React, { useEffect, useReducer, useState } from "react";
import { Box, Static, Text, useApp } from "ink";
import type { PipelineEvent } from "../pipeline-events.js";
import { slugify } from "../util.js";
import { colorsEnabled } from "../viz/colors.js";
import { loadVisualizationData } from "../viz/data.js";
import { renderHeader, renderTerminal } from "../viz/render-terminal.js";
import { Header } from "./Header.js";
import { Legend } from "./Legend.js";
import { SongLog } from "./SongLog.js";
import { SpotlightPanel } from "./SpotlightPanel.js";
import { initialState, reduce } from "./state.js";
import { StatsFooter } from "./StatsFooter.js";

const LEFT_WIDTH = 56;
const RIGHT_WIDTH = 44;
const OUTPUT_DIR = join(process.cwd(), "data", "output");

// Long enough to let the spotlight settle on the true final result (see
// useSpotlightSequencer's done-jump) before morphing into the dashboard;
// skipped almost entirely when nothing was actually classified live (a
// fully-cached run), since there's no live moment worth lingering on.
const SETTLE_WITH_ACTIVITY_MS = 700;
const SETTLE_WITHOUT_ACTIVITY_MS = 150;
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
 * dashboard `discoprint visualize` renders — committed via <Static> so it
 * survives after this component unmounts, instead of the live view just
 * vanishing and a separate plain-text pass taking over.
 */
export function App({ artistQuery, subscribe, showDashboard = true }: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(reduce, initialState(artistQuery));
  const [finalLines, setFinalLines] = useState<string[] | null>(null);

  useEffect(() => subscribe(dispatch), [subscribe]);

  useEffect(() => {
    if (state.phase !== "done") return;
    let cancelled = false;
    const artistName = state.artistName ?? state.artistQuery;
    const settleMs = state.totalToClassify > 0 ? SETTLE_WITH_ACTIVITY_MS : SETTLE_WITHOUT_ACTIVITY_MS;

    const settle = setTimeout(() => {
      void (async () => {
        try {
          const data = await loadVisualizationData(OUTPUT_DIR, slugify(artistName), artistName);
          if (cancelled) return;
          setFinalLines(showDashboard ? renderTerminal(data) : [renderHeader(data, colorsEnabled())]);
        } catch {
          // Shouldn't normally happen right after a successful run — fall
          // back to a plain line rather than hanging on the live view forever.
          if (!cancelled) setFinalLines([`✔ Done classifying ${artistName}.`]);
        }
      })();
    }, settleMs);

    return () => {
      cancelled = true;
      clearTimeout(settle);
    };
  }, [state.phase, state.artistName, state.artistQuery, state.totalToClassify, showDashboard]);

  useEffect(() => {
    if (finalLines === null) return;
    const timer = setTimeout(() => exit(), EXIT_AFTER_STATIC_MS);
    return () => clearTimeout(timer);
  }, [finalLines, exit]);

  if (finalLines) {
    return <Static items={finalLines}>{(line, i) => <Text key={i}>{line}</Text>}</Static>;
  }

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
