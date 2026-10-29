import { useEffect, useState } from "react";
import { clamp } from "../viz/colors.js";
import type { CompletedSong } from "./types.js";

// Purely cosmetic timing — we only ever get a song's final values in one
// shot (systemOne answers all 5 questions in a single response, see
// jev.ts), so this "fills in" a value that's already known, the same way
// the reference UI's demo did. It's a reveal animation, not a progress bar.
const REVEAL_STEPS = 8;

// Adaptive per-item pacing: paces itself against how many songs there are
// to show, not how fast they actually completed — so a fully-cached run
// (every completion landing in the same instant) still gets to walk
// through each result one at a time, the same as a real classify run does,
// instead of skipping straight to the end for lack of anything to wait on.
// Capped at a total budget so a big discography doesn't take forever to
// finish playing through before the app can move on.
const TOTAL_BUDGET_MS = Number(process.env.SPOTLIGHT_TOTAL_BUDGET_MS ?? 4000);
const MIN_PER_ITEM_MS = Number(process.env.SPOTLIGHT_MIN_ITEM_MS ?? 180);
const MAX_PER_ITEM_MS = Number(process.env.SPOTLIGHT_MAX_ITEM_MS ?? 650);
const REVEAL_SHARE = 0.6; // vs. the pause after, once fully revealed

function perItemTiming(totalToClassify: number): { revealStepMs: number; pauseMs: number } {
  const perItemMs = clamp(TOTAL_BUDGET_MS / Math.max(1, totalToClassify), MIN_PER_ITEM_MS, MAX_PER_ITEM_MS);
  return { revealStepMs: (perItemMs * REVEAL_SHARE) / REVEAL_STEPS, pauseMs: perItemMs * (1 - REVEAL_SHARE) };
}

export interface Spotlight {
  song: CompletedSong;
  progress: number;
}

export interface SpotlightSequencer {
  spotlight: Spotlight | null;
  /** True once every entry in `log` has had its moment in the spotlight — nothing left to animate. */
  caughtUp: boolean;
}

/**
 * Walks through `log` one entry at a time (oldest not-yet-shown first),
 * animating each into view before advancing to the next. The log itself
 * (src/tui/SongLog.tsx) updates immediately and never waits on this — this
 * is a decorative "here's what we just learned" flourish layered on top, so
 * a burst of concurrent completions never blocks the permanent record. The
 * caller (App.tsx) waits on `caughtUp` before moving past the live view, so
 * the full reveal always gets to play out regardless of how fast the
 * underlying completions actually arrived.
 */
export function useSpotlightSequencer(log: CompletedSong[], totalToClassify: number): SpotlightSequencer {
  const [cursor, setCursor] = useState(0);
  const [progress, setProgress] = useState(0);
  const song = log[cursor];
  const { revealStepMs, pauseMs } = perItemTiming(totalToClassify);

  useEffect(() => {
    if (!song) return;
    setProgress(0);
    let step = 0;
    // Tracked separately from `fill` (below) because it's scheduled *after*
    // the interval has already cleared itself — the effect's cleanup needs
    // to be able to cancel it too, or a reveal that already finished could
    // still advance the cursor later, after this effect has already been
    // superseded by a newer one.
    let advance: ReturnType<typeof setTimeout> | undefined;
    const fill = setInterval(() => {
      step += 1;
      setProgress(Math.min(1, step / REVEAL_STEPS));
      if (step >= REVEAL_STEPS) {
        clearInterval(fill);
        advance = setTimeout(() => setCursor((c) => Math.min(c + 1, log.length)), pauseMs);
      }
    }, revealStepMs);
    return () => {
      clearInterval(fill);
      clearTimeout(advance);
    };
    // Keyed on the song *object*, not `cursor`: array elements below the
    // append point keep their identity across `[...log, x]` copies, so this
    // stays stable while later items append behind it, but correctly fires
    // the moment `log[cursor]` itself changes — including the very first
    // transition from "no song yet" (undefined) to the first arrival, which
    // depending on `cursor` alone would miss entirely (cursor is still 0
    // both before and after that transition, so the effect would never
    // re-run to notice a song showed up).
  }, [song, revealStepMs, pauseMs]);

  return { spotlight: song ? { song, progress } : null, caughtUp: cursor >= log.length };
}
