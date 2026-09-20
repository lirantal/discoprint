import { useEffect, useRef, useState } from "react";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
// Overridable so tests can tick through frames without real 80ms waits.
const FRAME_INTERVAL_MS = Number(process.env.SPINNER_FRAME_INTERVAL_MS ?? 80);

/** A cycling braille spinner glyph, ticking only while `active`. */
export function useSpinnerFrame(active: boolean): string {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active]);

  // Fallback is unreachable: `frame` is always kept in range by the modulo above.
  return SPINNER_FRAMES[frame] ?? "⠋";
}

/** Milliseconds since this hook first became active, refreshed periodically while it stays active. */
export function useElapsedMs(active: boolean, refreshMs = 200): number {
  const startedAtRef = useRef<number | null>(null);
  const [, forceTick] = useState(0);
  startedAtRef.current ??= Date.now();

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => forceTick((t) => t + 1), refreshMs);
    return () => clearInterval(timer);
  }, [active, refreshMs]);

  return Date.now() - startedAtRef.current;
}
