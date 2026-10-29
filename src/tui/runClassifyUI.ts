import { join } from "node:path";
import React from "react";
import { render } from "ink";
import { resolveDataDir } from "../paths.js";
import { runPipeline, type RunOptions } from "../pipeline.js";
import type { PipelineEvent } from "../pipeline-events.js";
import { sleep } from "../util.js";
import { App } from "./App.js";

// Gives React a moment to actually paint the "run-failed"/"classify-failed"
// state (a red line in the live view) before we tear it down — otherwise
// unmount() can race the event that triggered it, erasing a frame that
// never got drawn and leaving nothing to explain why the app just vanished.
const ERROR_PAINT_MS = 300;

/**
 * Tags an error rethrown from here as already shown on screen (the red
 * "✖ ..." line the live view just painted), so the top-level CLI catch
 * (src/bin/cli.ts) knows not to print the same message a second time.
 */
export const ALREADY_DISPLAYED = Symbol("alreadyDisplayedInUI");

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

  const outputDir = join(resolveDataDir(options.dataDir), "output");
  const instance = render(
    React.createElement(App, { artistQuery, subscribe, showDashboard: uiOptions.showDashboard, outputDir }),
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
    if (error !== null && typeof error === "object") {
      (error as Record<PropertyKey, unknown>)[ALREADY_DISPLAYED] = true;
    }
    throw error;
  }

  await instance.waitUntilExit();
}
