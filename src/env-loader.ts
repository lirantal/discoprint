import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { internal, patchGlobalConsole } from "varlock";

const require = createRequire(import.meta.url);

/**
 * Locates the installed `varlock` CLI script via Node's own module resolution
 * (handles pnpm's nested node_modules layout, symlinked/global installs,
 * etc.) instead of assuming `varlock` is on PATH — a global `npx discoprint`
 * install has no reason to expose its own dependencies' bins there, unlike a
 * local project where a package manager adds `node_modules/.bin` to PATH.
 */
function resolveVarlockCliPath(): string {
  const mainEntryPath = require.resolve("varlock"); // .../varlock/dist/index.mjs
  const packageRoot = path.dirname(path.dirname(mainEntryPath));
  return path.join(packageRoot, "bin", "cli.js");
}

/**
 * Loads env vars from our own bundled `.env.schema` (see `schemaPath` — ships
 * with the npm package, see package.json's `files`) plus whatever
 * `.env`/`.env.local`/process.env values exist in `cwd`, and injects the
 * resolved values into `process.env`.
 *
 * We can't use the `varlock/auto-load` convenience import for this: it has
 * no way to point at an explicit schema path, and always auto-discovers
 * `.env.schema` starting from `process.cwd()` — which would never find ours
 * once installed, since it doesn't live in the user's own project directory.
 * So this spawns the `varlock` CLI directly with explicit `--path` flags
 * (the same mechanism `varlock/auto-load` uses internally, see its
 * `execSyncVarlock` call), then feeds the result through the same
 * `initVarlockEnv()` injection/redaction path `varlock/auto-load` itself
 * uses, so `@sensitive` values get the same console-redaction protection
 * either way.
 *
 * Never throws: any failure (a bad value, a spawn error, malformed output)
 * is swallowed and simply leaves `process.env` as it was, so a config
 * problem here degrades to the interactive TYPESAFE_API_KEY prompt in
 * cli.ts rather than crashing the whole CLI on something recoverable.
 *
 * Returns per-item resolution errors (e.g. `{ TYPESAFE_API_KEY: "Unknown
 * resolver function: op()" }`) so a caller can say *why* a value is
 * missing — "couldn't resolve your op() reference" is a very different
 * problem from "you haven't set anything at all", and the pretty banner
 * that would normally explain the difference is exactly what the stdio
 * override above keeps off the terminal.
 */
export function loadEnv(schemaPath: string): Record<string, string> {
  // initVarlockEnv() (below) resets process.env to a snapshot it captured on
  // its *own* first load, then re-applies whatever this run resolved —
  // including deleting any key that resolved to undefined. That resolution
  // happens in a separate `varlock` subprocess, spawned fresh below; its own
  // detection of "this is a process.env override" doesn't have to agree with
  // what's already sitting in *our* process.env, and if it disagrees for any
  // reason, it can delete a variable (e.g. an already-exported
  // TYPESAFE_API_KEY) that was never ours to touch. Snapshot it first and
  // restore anything that was there before and came out missing after —
  // never let this leave process.env less populated than it started.
  const before = { ...process.env };

  const cwd = process.cwd();
  // Inside a clone of this repo, the bundled schema *is* cwd's own
  // .env.schema — passing both as separate --path entries would load that
  // one file twice (once directly, once via cwd's directory auto-discovery)
  // and the 1Password plugin's @initOp then fails to initialize a second
  // time ("Instance with id \"_default\" already initialized"). A single
  // directory path covers the schema plus cwd's .env/.env.local the same
  // way plain `varlock/auto-load` auto-discovery would.
  const paths = path.dirname(schemaPath) === cwd ? [cwd] : [schemaPath, cwd];

  let stdout: string;
  try {
    stdout = execFileSync(
      process.execPath,
      [resolveVarlockCliPath(), "load", ...paths.flatMap((p) => ["--path", p]), "--format", "json-full", "--compact"],
      // execFileSync/execSync default to *inheriting* the child's stderr
      // (only stdout is piped unless told otherwise) — without this, a
      // config error's "🚨 Configuration is currently invalid" banner would
      // print straight to our terminal even though we handle the failure
      // gracefully below and never surface that banner ourselves.
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    // A validation error (e.g. a bad value) exits non-zero but still writes
    // the same JSON to stdout — recover it from the error instead of giving up.
    stdout = (err as { stdout?: string } | undefined)?.stdout ?? "";
  }

  if (!stdout) return {};

  try {
    const parsed = JSON.parse(stdout);
    (globalThis as Record<string, unknown>).__varlockLoadedEnv = parsed;
    patchGlobalConsole();
    internal.initVarlockEnv({ allowFail: true });

    for (const key of Object.keys(before)) {
      if (before[key] && !process.env[key]) process.env[key] = before[key];
    }

    return (parsed?.errors?.configItems as Record<string, string> | undefined) ?? {};
  } catch {
    // Malformed output — leave process.env untouched.
    return {};
  }
}
