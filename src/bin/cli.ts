#!/usr/bin/env node
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../env-loader.js";
import { describeError, KnownError } from "../errors.js";
import { resolveDataDir } from "../paths.js";
import type { PipelineEvent } from "../pipeline-events.js";
import { runPipeline } from "../pipeline.js";
import { canPromptInteractively, promptPassword, promptText } from "../prompt.js";
import { installTerminalRestoreGuard } from "../terminal-restore.js";
import { ALREADY_DISPLAYED, runClassifyUI } from "../tui/runClassifyUI.js";
import { canAnimate } from "../tty.js";
import { slugify } from "../util.js";
import { colorsEnabled } from "../viz/colors.js";
import { loadVisualizationData } from "../viz/data.js";
import { renderHeader, renderTerminal } from "../viz/render-terminal.js";

const DEFAULT_LIMIT = 100;

/**
 * The schema ships inside our own package (see package.json's `files`), two
 * directories above this file in both the dev (`src/bin/cli.ts`) and built
 * (`dist/bin/cli.mjs`) layouts, so this relative path holds for either one.
 */
function bundledSchemaPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".env.schema");
}

const USAGE = `Usage:
  discoprint [Artist Name] [--limit N] [--include-non-albums] [--force] [--no-visualize] [--verbose] [--data-dir PATH]
    Classify an artist's discography with Jev, then show the visualization.
    With no artist and a real terminal, prompts interactively instead.
    In a real terminal, progress renders as a live dashboard; pass --verbose
    for a plain-text log instead (or when output isn't a terminal).

    Cache and output files live under $XDG_CONFIG_HOME/discoprint (falling
    back to ~/.config/discoprint) by default. Override with --data-dir, or
    the DISCOPRINT_DATA_DIR environment variable.

  discoprint visualize [Artist Name] [--data-dir PATH]
    Re-render the visualization from already-classified data. No network calls.`;

interface ClassifyArgs {
  artist: string;
  limit?: number;
  includeNonAlbums: boolean;
  force: boolean;
  noVisualize: boolean;
  verbose: boolean;
  dataDir?: string;
}

function parseClassifyArgs(argv: string[]): ClassifyArgs {
  const args: ClassifyArgs = {
    artist: "",
    includeNonAlbums: false,
    force: false,
    noVisualize: false,
    verbose: false,
  };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === "--limit") {
      const raw = argv[++i];
      const value = Number(raw);
      if (!Number.isInteger(value) || value <= 0) {
        throw new KnownError(`--limit must be a positive whole number, got "${raw ?? ""}".`);
      }
      args.limit = value;
    } else if (arg === "--include-non-albums") {
      args.includeNonAlbums = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--no-visualize") {
      args.noVisualize = true;
    } else if (arg === "--verbose") {
      args.verbose = true;
    } else if (arg === "--data-dir") {
      const raw = argv[++i];
      if (!raw) throw new KnownError("--data-dir requires a path.");
      args.dataDir = raw;
    } else {
      positional.push(arg);
    }
  }

  args.artist = positional.join(" ");
  return args;
}

/** Pulls --data-dir out of the visualize command's argv, leaving the rest as the artist name. */
function extractDataDirFlag(argv: string[]): { dataDir?: string; rest: string[] } {
  const rest: string[] = [];
  let dataDir: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--data-dir") {
      const raw = argv[++i];
      if (!raw) throw new KnownError("--data-dir requires a path.");
      dataDir = raw;
    } else if (arg !== undefined) {
      rest.push(arg);
    }
  }

  return { dataDir, rest };
}

async function resolveArtistInteractively(title: string): Promise<string> {
  if (!canPromptInteractively()) {
    console.error(USAGE);
    process.exit(1);
  }

  const answer = await promptText({
    title,
    summaryLabel: "Artist",
    printSummary: false,
    validate: (value) => (value === "" ? "Enter an artist name." : undefined),
  });
  if (answer.status === "cancelled") {
    process.exit(1);
  }

  return answer.value;
}

/**
 * Prompts for TYPESAFE_API_KEY when it's missing from the environment/.env
 * (not marked @required in .env.schema, precisely so this can run instead of
 * varlock hard-failing before we get a chance to ask). Only sets it for this
 * process — never written to disk. Returns whether it prompted, so the
 * caller can add the same visual separation as the artist/limit prompts.
 *
 * `loadError`, from `loadEnv`'s return value, is the reason a *declared*
 * value (e.g. an `op(...)` reference) failed to resolve — distinct from
 * simply never having set one, and worth telling the user directly instead
 * of a generic "not found" that reads as if they hadn't set anything.
 */
async function ensureApiKey(loadError: string | undefined): Promise<boolean> {
  if (process.env.TYPESAFE_API_KEY) return false;

  const reason = loadError
    ? `Couldn't resolve it from your .env: ${loadError}`
    : "No TYPESAFE_API_KEY found in your environment or .env file.";

  if (!canPromptInteractively()) {
    throw new KnownError(
      `${reason}\nSet it in your local .env (see README) — get a key at https://console.typesafe.ai/keys.`,
    );
  }

  const answer = await promptPassword({
    title: "TypeSafe API key needed",
    details: [reason, "Get one at https://console.typesafe.ai/keys — used for this run only, not saved to disk."],
    summaryLabel: "TYPESAFE_API_KEY",
    validate: (value) => (value === "" ? "Enter an API key." : undefined),
  });
  if (answer.status === "cancelled") {
    process.exit(1);
  }

  process.env.TYPESAFE_API_KEY = answer.value;
  return true;
}

async function printVisualization(artist: string, outputDir: string): Promise<void> {
  const data = await loadVisualizationData(outputDir, slugify(artist), artist);
  console.log();
  for (const line of renderTerminal(data)) {
    console.log(line);
  }
  console.log();
}

async function runVisualizeCommand(argv: string[]): Promise<void> {
  const { dataDir, rest } = extractDataDirFlag(argv);
  const artist =
    rest.join(" ").trim() ||
    (await resolveArtistInteractively("Which artist's classification data do you want to visualize?"));
  const outputDir = join(resolveDataDir(dataDir), "output");
  await printVisualization(artist, outputDir);
}

/** Used by the non-Ink paths (--verbose, non-TTY) — the Ink path shows this itself as part of its own live-to-dashboard transition. */
async function printFinalOutput(artist: string, showDashboard: boolean, outputDir: string): Promise<void> {
  if (showDashboard) {
    await printVisualization(artist, outputDir);
    return;
  }
  const data = await loadVisualizationData(outputDir, slugify(artist), artist);
  console.log();
  console.log(renderHeader(data, colorsEnabled()));
}

/** A rate-limit retry is worth a line even in the default quiet mode — silently eating up to ~31s otherwise looks like a hang. */
function logRetriesOnly(event: PipelineEvent): void {
  if (event.type === "musicbrainz-retry") {
    console.warn(
      `MusicBrainz rate-limited (503), retrying in ${event.delayMs}ms (attempt ${event.attempt}/${event.maxRetries})...`,
    );
  }
}

/** Replicates the plain-text progress log the live dashboard replaces, for --verbose and non-TTY output. */
function createPlainLogger(artistQuery: string, outputDir: string): (event: PipelineEvent) => void {
  return (event) => {
    switch (event.type) {
      case "musicbrainz-retry":
        logRetriesOnly(event);
        break;
      case "artist-resolved":
        console.log(
          `Resolved "${artistQuery}" -> ${event.name}${event.disambiguation ? ` (${event.disambiguation})` : ""}`,
        );
        break;
      case "discography-fetching":
        console.log("Fetching discography from MusicBrainz (1 request/sec, this takes a while)...");
        break;
      case "discography-resolved":
        console.log(`Discography resolved: ${event.trackCount} unique tracks.`);
        break;
      case "lyrics-ready":
        console.log(`Lyrics ready — ${event.withLyrics}/${event.total} tracks have lyrics.`);
        break;
      case "classify-completed":
        console.log(
          `Classified: ${event.classification.track} - theme=${event.classification.theme} mood=${event.classification.mood.toFixed(2)}`,
        );
        break;
      case "run-completed": {
        const { meta } = event;
        console.log(
          `\nDone. Classified ${meta.totalSongsInOutput}/${event.totalConsidered} tracks (${event.skippedCount} skipped, no lyrics).`,
        );
        if (meta.songsClassifiedThisRun > 0) {
          console.log(
            `Jev usage this run: ${meta.songsClassifiedThisRun} song(s), ${meta.tokens.input} input / ${meta.tokens.output} output tokens, ` +
              `~$${meta.estimatedCostUsd.toFixed(4)}, ${(meta.durationMs.classification / 1000).toFixed(1)}s.`,
          );
        }
        console.log(`Output: ${join(outputDir, `${slugify(meta.artist)}.json`)}`);
        break;
      }
      default:
        break;
    }
  };
}

async function runClassifyCommand(argv: string[]): Promise<void> {
  const args = parseClassifyArgs(argv);
  const wasInteractive = !args.artist;

  if (!args.artist) {
    args.artist = await resolveArtistInteractively("Which artist or band?");

    if (args.limit === undefined) {
      const limitAnswer = await promptText({
        title: "How many songs to classify?",
        summaryLabel: "Limit",
        // The typed (or defaulted) value is already visible right above, echoed by the prompt itself.
        printSummary: false,
        defaultValue: String(DEFAULT_LIMIT),
        validate: (value) =>
          Number.isInteger(Number(value)) && Number(value) > 0 ? undefined : "Enter a positive whole number.",
      });
      if (limitAnswer.status === "cancelled") {
        process.exit(1);
      } else {
        args.limit = Number(limitAnswer.value);
      }
    }
  }

  // Only needed on this path: `visualize` alone needs no API key.
  // See .env.schema, src/env-loader.ts, and https://varlock.dev.
  const loadErrors = loadEnv(bundledSchemaPath());

  const apiKeyPrompted = await ensureApiKey(loadErrors.TYPESAFE_API_KEY);

  // Separates the prompt Q&A above from the classify run's own output below.
  if (wasInteractive || apiKeyPrompted) console.log();

  const runOptions = {
    limit: args.limit,
    includeNonAlbums: args.includeNonAlbums,
    force: args.force,
    dataDir: args.dataDir,
  };
  const showDashboard = !args.noVisualize;
  const outputDir = join(resolveDataDir(args.dataDir), "output");

  if (args.verbose) {
    await runPipeline(args.artist, { ...runOptions, onEvent: createPlainLogger(args.artist, outputDir) });
    await printFinalOutput(args.artist, showDashboard, outputDir);
  } else if (canAnimate()) {
    // The live view settles into this same dashboard itself once done —
    // nothing further to print here (see src/tui/App.tsx).
    await runClassifyUI(args.artist, runOptions, { showDashboard });
  } else {
    await runPipeline(args.artist, { ...runOptions, onEvent: logRetriesOnly });
    await printFinalOutput(args.artist, showDashboard, outputDir);
  }
}

async function main(): Promise<void> {
  installTerminalRestoreGuard();

  // Some package-manager script runners (observed with pnpm + tsx) forward a
  // literal "--" through to the script instead of stripping it, corrupting
  // whatever comes after (e.g. `pnpm run classify -- "Bon Jovi"`). Drop any
  // stray "--" tokens so the CLI behaves the same regardless of what invoked it.
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");

  if (argv[0] === "--help" || argv[0] === "-h") {
    console.log(USAGE);
    return;
  }

  if (argv[0] === "visualize") {
    await runVisualizeCommand(argv.slice(1));
    return;
  }

  await runClassifyCommand(argv);
}

main().catch((err) => {
  // The live view (src/tui/runClassifyUI.ts) already painted this on screen
  // as its own red "✖ ..." line before rethrowing — don't print it again.
  const alreadyDisplayed = err !== null && typeof err === "object" && (err as Record<PropertyKey, unknown>)[ALREADY_DISPLAYED] === true;
  if (!alreadyDisplayed) {
    const described = describeError(err);
    if (described.known) {
      console.error(described.message);
    } else {
      // Anything we didn't anticipate: keep the stack trace so it's debuggable.
      console.error(err);
    }
  }
  process.exit(1);
});
