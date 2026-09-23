// Ink hides the cursor while it's rendering and restores it via a
// `process.on("exit")` hook it registers internally (through the `cli-cursor`
// / `restore-cursor` packages) — that hook only fires once the whole Node
// process actually terminates. If something keeps the process alive well
// past the point the UI itself went away (see runClassifyUI.ts, which used
// to keep awaiting the classify pipeline in the background after Ctrl+C tore
// down the live view), the cursor stays hidden for that entire stretch. And
// if the terminal is back in canonical mode by then (raw mode already
// disabled) and the user hits Ctrl+C again out of impatience, Node's default
// SIGINT behavior kills the process immediately with *no* "exit" event at
// all — leaving the cursor hidden for good, even after the shell prompt
// returns. This installs an explicit, synchronous backstop so Ctrl+C/SIGTERM
// always leaves the terminal in a normal, usable state.
const SHOW_CURSOR = "\u001B[?25h";
const RESET_STYLE = "\u001B[0m";

let installed = false;

function restoreTerminal(): void {
  if (process.stdout.isTTY) {
    process.stdout.write(RESET_STYLE + SHOW_CURSOR);
  }
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
    process.stdin.setRawMode(false);
  }
}

/** Call once, as early as possible in the CLI entrypoint. */
export function installTerminalRestoreGuard(): void {
  if (installed) return;
  installed = true;

  process.on("SIGINT", () => {
    restoreTerminal();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    restoreTerminal();
    process.exit(143);
  });
}
