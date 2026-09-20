import React from "react";
import { render } from "ink";
import { runPipeline, type RunOptions } from "../pipeline.js";
import type { PipelineEvent } from "../pipeline-events.js";
import { App } from "./App.js";

/**
 * Runs the real classify pipeline behind a live Ink dashboard. Bridges the
 * two with a tiny pub-sub instead of wiring Ink into pipeline.ts directly —
 * runPipeline stays renderer-agnostic, and this is the one place that knows
 * both sides exist.
 */
export async function runClassifyUI(artistQuery: string, options: Omit<RunOptions, "onEvent"> = {}): Promise<void> {
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

  const instance = render(React.createElement(App, { artistQuery, subscribe }));

  try {
    await runPipeline(artistQuery, {
      ...options,
      onEvent: (event) => {
        history.push(event);
        for (const listener of listeners) listener(event);
      },
    });
  } catch (error) {
    instance.unmount();
    throw error;
  }

  await instance.waitUntilExit();
}
