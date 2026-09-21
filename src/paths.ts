import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Base directory for discoprint's cache and output files.
 *
 * Defaults to the XDG convention (`$XDG_CONFIG_HOME/discoprint`, falling
 * back to `~/.config/discoprint`) rather than a `data/` folder inside
 * whatever directory the CLI happens to be run from — dropping files into a
 * dev's project/repo directory was surprising and intrusive.
 *
 * Override with `--data-dir <path>` (see src/bin/cli.ts) or the
 * `DISCOPRINT_DATA_DIR` environment variable; an explicit `override` wins
 * over both.
 */
export function resolveDataDir(override?: string): string {
  if (override) return override;
  if (process.env.DISCOPRINT_DATA_DIR) return process.env.DISCOPRINT_DATA_DIR;

  const xdgConfigHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(xdgConfigHome, "discoprint");
}
