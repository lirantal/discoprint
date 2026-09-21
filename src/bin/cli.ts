#!/usr/bin/env node
import { join } from "node:path";
import { describeError, KnownError } from "../errors.js";
import type { PipelineEvent } from "../pipeline-events.js";
import { runPipeline } from "../pipeline.js";
import { canPromptInteractively, promptText } from "../prompt.js";
import { ALREADY_DISPLAYED, runClassifyUI } from "../tui/runClassifyUI.js";
import { canAnimate } from "../tty.js";
import { slugify } from "../util.js";
import { colorsEnabled } from "../viz/colors.js";
import { loadVisualizationData } from "../viz/data.js";
import { renderHeader, renderTerminal } from "../viz/render-terminal.js";

const DEFAULT_LIMIT = 100;
const OUTPUT_DIR = join(process.cwd(), "data", "output");

const USAGE = `Usage:
  discoprint [Artist Name] [--limit N] [--include-non-albums] [--force] [--no-visualize] [--verbose]
    Classify an artist's discography with Jev, then show the visualization.
    With no artist and a real terminal, prompts interactively instead.
    In a real terminal, progress renders as a live dashboard; pass --verbose
    for a plain-text log instead (or when output isn't a terminal).

  discoprint visualize [Artist Name]
    Re-render the visualization from already-classified data. No network calls.`;

interface ClassifyArgs {
  artist: string;
  limit?: number;
  includeNonAlbums: boolean;
  force: boolean;
  noVisualize: boolean;
  verbose: boolean;
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
    } else {
      positional.push(arg);
    }
  }

  args.artist = positional.join(" ");
  return args;
}

async function resolveArtistInteractively(title: string): Promise<string> {
  if (!canPromptInteractively()) {
    console.error(USAGE);
    process.exit(1);
  }

  const answer = await promptText({
    title,
    summaryLabel: "Artist",
    validate: (value) => (value === "" ? "Enter an artist name." : undefined),
  });
  if (answer.status === "cancelled") {
    process.exit(1);
  }

  return answer.value;
}

async function printVisualization(artist: string): Promise<void> {
  const data = await loadVisualizationData(OUTPUT_DIR, slugify(artist), artist);
  console.log();
  for (const line of renderTerminal(data)) {
    console.log(line);
  }
  console.log();
}

async function runVisualizeCommand(argv: string[]): Promise<void> {
  const artist =
    argv.join(" ").trim() ||
    (await resolveArtistInteractively("Which artist's classification data do you want to visualize?"));
  await printVisualization(artist);
}

/** Used by the non-Ink paths (--verbose, non-TTY) — the Ink path shows this itself as part of its own live-to-dashboard transition. */
async function printFinalOutput(artist: string, showDashboard: boolean): Promise<void> {
  if (showDashboard) {
    await printVisualization(artist);
    return;
  }
  const data = await loadVisualizationData(OUTPUT_DIR, slugify(artist), artist);
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
function createPlainLogger(artistQuery: string): (event: PipelineEvent) => void {
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
        console.log(`Output: data/output/${slugify(meta.artist)}.json`);
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

  // Separates the prompt Q&A above from the classify run's own output below.
  if (wasInteractive) console.log();

  // Loaded lazily and only on this path: `visualize` alone needs no API key.
  // See .env.schema and https://varlock.dev.
  await import("varlock/auto-load");

  const runOptions = { limit: args.limit, includeNonAlbums: args.includeNonAlbums, force: args.force };
  const showDashboard = !args.noVisualize;

  if (args.verbose) {
    await runPipeline(args.artist, { ...runOptions, onEvent: createPlainLogger(args.artist) });
    await printFinalOutput(args.artist, showDashboard);
  } else if (canAnimate()) {
    // The live view settles into this same dashboard itself once done —
    // nothing further to print here (see src/tui/App.tsx).
    await runClassifyUI(args.artist, runOptions, { showDashboard });
  } else {
    await runPipeline(args.artist, { ...runOptions, onEvent: logRetriesOnly });
    await printFinalOutput(args.artist, showDashboard);
  }
}

async function main(): Promise<void> {
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
