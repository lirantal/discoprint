import { useEffect, useState } from "react";
import type { CompletedSong } from "./types.js";

// Purely cosmetic timing — we only ever get a song's final values in one
// shot (systemOne answers all 5 questions in a single response, see
// jev.ts), so this "fills in" a value that's already known, the same way
// the reference UI's demo did. It's a reveal animation, not a progress bar.
const REVEAL_STEPS = 8;
const REVEAL_STEP_MS = Number(process.env.SPINNER_FRAME_INTERVAL_MS ?? 40);
const PAUSE_AFTER_REVEAL_MS = 260;

export interface Spotlight {
  song: CompletedSong;
  progress: number;
}

/**
 * Walks through `log` one entry at a time (oldest not-yet-shown first),
 * animating each into view before advancing to the next. The log itself
 * (src/tui/SongLog.tsx) updates immediately and never waits on this — this
 * is a decorative "here's what we just learned" flourish layered on top, so
 * a burst of concurrent completions never blocks the permanent record.
 *
 * `done` lets it skip straight to the true last result once there's nothing
 * left to wait for — otherwise a fast batch (classification finishing well
 * before the sequencer works through its backlog one by one) would exit
 * mid-reveal on some earlier song instead of ending on the final one.
 */
export function useSpotlightSequencer(log: CompletedSong[], done: boolean): Spotlight | null {
  const [cursor, setCursor] = useState(0);
  const [progress, setProgress] = useState(0);
  const song = log[cursor];

  useEffect(() => {
    if (done && log.length > 0) setCursor(log.length - 1);
  }, [done, log.length]);

  useEffect(() => {
    if (!song) return;
    setProgress(0);
    let step = 0;
    // Tracked separately from `fill` (below) because it's scheduled *after*
    // the interval has already cleared itself — the effect's cleanup needs
    // to be able to cancel it too, or a reveal that already finished can
    // still advance the cursor later, after something else (e.g. the
    // done-jump above) has already moved it — pushing it out of bounds.
    let advance: ReturnType<typeof setTimeout> | undefined;
    const fill = setInterval(() => {
      step += 1;
      setProgress(Math.min(1, step / REVEAL_STEPS));
      if (step >= REVEAL_STEPS) {
        clearInterval(fill);
        advance = setTimeout(() => setCursor((c) => Math.min(c + 1, log.length - 1)), PAUSE_AFTER_REVEAL_MS);
      }
    }, REVEAL_STEP_MS);
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
  }, [song]);

  return song ? { song, progress } : null;
}
