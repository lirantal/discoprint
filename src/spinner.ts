// Minimal terminal spinner / live task-list rendering — no dependencies,
// hand-rolled ANSI cursor control in the same spirit as prompt.ts and
// viz/colors.ts (loosely inspired by the animations in lirantal/boxdown,
// same author as create-node-lib, Apache-2.0 — reimplemented from scratch
// so we don't need to pull in a spinner package).

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
// Overridable so tests can tick through frames without real 80ms waits.
const FRAME_INTERVAL_MS = Number(process.env.SPINNER_FRAME_INTERVAL_MS ?? 80);

const HIDE_CURSOR = "\x1B[?25l";
const SHOW_CURSOR = "\x1B[?25h";
const CLEAR_LINE = "\x1B[2K\r";
const cursorUp = (n: number): string => `\x1B[${n}A`;

type Output = NodeJS.WritableStream & { columns?: number; isTTY?: boolean };

function isCiEnvironment(env: NodeJS.ProcessEnv): boolean {
  const ci = env.CI;
  return ci !== undefined && ci !== "" && ci !== "0" && ci !== "false";
}

/** Whether it's safe to animate: a real terminal, and not CI (which usually isn't a TTY anyway, but may be piped through one). */
export function canAnimate(
  output: NodeJS.WritableStream & { isTTY?: boolean } = process.stdout,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return !isCiEnvironment(env) && output.isTTY === true;
}

// Rough, non-ANSI-aware truncation: fine here since each line carries at
// most one color run, and it only needs to stop a line from *wrapping*
// (which would desync the cursor-up math), not render perfectly.
function truncateToWidth(text: string, output: Output): string {
  // Some pty layers report 0 columns (not just undefined) before a real size
  // is known — `||` (not `??`) is deliberate so that falls back to 80 too.
  const width = output.columns || 80;
  return text.length > width ? `${text.slice(0, Math.max(1, width - 1))}…` : text;
}

export interface Spinner {
  /** Updates the in-flight label without changing the spinner's animation state. */
  update(label: string): void;
  /** Stops the animation and leaves `finalLine` in its place. */
  stop(finalLine: string): void;
}

/** A single animated line, e.g. "⠋ Resolving artist…" -> "✔ Resolved as Bon Jovi". */
export function startSpinner(label: string, output: Output = process.stdout): Spinner {
  let text = label;
  let frame = 0;

  function paint(): void {
    output.write(`${CLEAR_LINE}${FRAMES[frame]} ${truncateToWidth(text, output)}`);
  }

  output.write(HIDE_CURSOR);
  paint();
  const timer = setInterval(() => {
    frame = (frame + 1) % FRAMES.length;
    paint();
  }, FRAME_INTERVAL_MS);
  timer.unref();

  return {
    update(nextLabel: string) {
      text = nextLabel;
    },
    stop(finalLine: string) {
      clearInterval(timer);
      output.write(`${CLEAR_LINE}${finalLine}\n${SHOW_CURSOR}`);
    },
  };
}

export interface TaskListItem {
  id: string;
  label: string;
}

export interface TaskList {
  /** Marks one line as finished, freezing it as `finalLabel` instead of the spinner. */
  complete(id: string, finalLabel: string): void;
  /** Stops the animation, leaving every line in its last-rendered state. */
  stop(): void;
}

/**
 * One animated line per item, all redrawn in place on every tick — e.g. a
 * checklist of songs being classified concurrently, each swapping its
 * spinner for a colored result as it completes.
 */
export function startTaskList(items: TaskListItem[], output: Output = process.stdout): TaskList {
  const ids = items.map((item) => item.id);
  const labels = new Map(items.map((item) => [item.id, item.label]));
  const finalLabels = new Map<string, string>();
  let frame = 0;

  function renderLine(id: string): string {
    const finalLabel = finalLabels.get(id);
    const content = finalLabel ?? `${FRAMES[frame]} ${labels.get(id) ?? ""}`;
    return truncateToWidth(content, output);
  }

  function paint(): void {
    output.write(`${ids.map((id) => `${CLEAR_LINE}${renderLine(id)}`).join("\n")}\n`);
  }

  output.write(HIDE_CURSOR);
  paint();
  const timer =
    ids.length > 0
      ? setInterval(() => {
          frame = (frame + 1) % FRAMES.length;
          output.write(cursorUp(ids.length));
          paint();
        }, FRAME_INTERVAL_MS)
      : undefined;
  timer?.unref();

  return {
    complete(id: string, finalLabel: string) {
      finalLabels.set(id, finalLabel);
    },
    stop() {
      if (timer) clearInterval(timer);
      if (ids.length > 0) {
        output.write(cursorUp(ids.length));
        paint();
      }
      output.write(SHOW_CURSOR);
    },
  };
}
