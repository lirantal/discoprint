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
 */
export function loadEnv(schemaPath: string): void {
  let stdout: string;
  try {
    stdout = execFileSync(
      process.execPath,
      [
        resolveVarlockCliPath(),
        "load",
        "--path",
        schemaPath,
        "--path",
        process.cwd(),
        "--format",
        "json-full",
        "--compact",
      ],
      { encoding: "utf8" },
    );
  } catch (err) {
    // A validation error (e.g. a bad value) exits non-zero but still writes
    // the same JSON to stdout — recover it from the error instead of giving up.
    stdout = (err as { stdout?: string } | undefined)?.stdout ?? "";
  }

  if (!stdout) return;

  try {
    (globalThis as Record<string, unknown>).__varlockLoadedEnv = JSON.parse(stdout);
    patchGlobalConsole();
    internal.initVarlockEnv({ allowFail: true });
  } catch {
    // Malformed output — leave process.env untouched.
  }
}
