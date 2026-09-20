// Shared terminal-capability checks used by both the interactive text
// prompts (prompt.ts) and the live Ink classify UI (tui/) — kept in one
// place so "is this actually an interactive terminal" is answered the same
// way everywhere.

export function isCiEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  const ci = env.CI;
  return ci !== undefined && ci !== "" && ci !== "0" && ci !== "false";
}

/** Whether it's safe to render a live animation: a real terminal, and not CI. */
export function canAnimate(
  output: NodeJS.WritableStream & { isTTY?: boolean } = process.stdout,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return !isCiEnvironment(env) && output.isTTY === true;
}
