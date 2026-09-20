import React from "react";
import { render } from "ink";
import { runPipeline, type RunOptions } from "../pipeline.js";
import type { PipelineEvent } from "../pipeline-events.js";
import { sleep } from "../util.js";
import { App } from "./App.js";

// Gives React a moment to actually paint the "run-failed"/"classify-failed"
// state (a red line in the live view) before we tear it down — otherwise
// unmount() can race the event that triggered it, erasing a frame that
// never got drawn and leaving nothing to explain why the app just vanished.
const ERROR_PAINT_MS = 300;

export interface RunClassifyUIOptions {
  /** Once done, morph into the full dashboard (default) or just a one-line summary — mirrors --no-visualize. */
  showDashboard?: boolean;
}

/**
 * Runs the real classify pipeline behind a live Ink dashboard, which itself
 * settles into the final dashboard once done — one continuous app, not a
 * live view that exits and hands off to a separate plain-text render pass.
 * Bridges pipeline <-> UI with a tiny pub-sub instead of wiring Ink into
 * pipeline.ts directly — runPipeline stays renderer-agnostic, and this is
 * the one place that knows both sides exist.
 */
export async function runClassifyUI(
  artistQuery: string,
  options: Omit<RunOptions, "onEvent"> = {},
  uiOptions: RunClassifyUIOptions = {},
): Promise<void> {
  // Buffered so a listener that subscribes late (e.g. after React's first
  // effect-flush) still sees every event from the start, not just what's
  // emitted after it attaches.
  const history: PipelineEvent[] = [];
  const listeners = new Set<(event: PipelineEvent) => void>();

  const subscribe = (listener: (event: PipelineEvent) => void): (() => void) => {
    for (const event of history) listener(event);
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const instance = render(
    React.createElement(App, { artistQuery, subscribe, showDashboard: uiOptions.showDashboard }),
  );

  try {
    await runPipeline(artistQuery, {
      ...options,
      onEvent: (event) => {
        history.push(event);
        for (const listener of listeners) listener(event);
      },
    });
  } catch (error) {
    await sleep(ERROR_PAINT_MS);
    instance.unmount();
    throw error;
  }

  await instance.waitUntilExit();
}
