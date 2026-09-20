#!/usr/bin/env node
import { join } from "node:path";
import { describeError, KnownError } from "../errors.js";
import { runPipeline } from "../pipeline.js";
import { canPromptInteractively, promptText } from "../prompt.js";
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
    By default only a one-line summary is printed; pass --verbose for
    per-song progress (artist resolution, discography fetch, one line per song).

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

  await runPipeline(args.artist, {
    limit: args.limit,
    includeNonAlbums: args.includeNonAlbums,
    force: args.force,
    verbose: args.verbose,
  });

  if (!args.noVisualize) {
    await printVisualization(args.artist);
  } else {
    // No dashboard to show, so print the one-line summary the dashboard's
    // header would otherwise have carried.
    const data = await loadVisualizationData(OUTPUT_DIR, slugify(args.artist), args.artist);
    console.log();
    console.log(renderHeader(data, colorsEnabled()));
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
  const described = describeError(err);
  if (described.known) {
    console.error(described.message);
  } else {
    // Anything we didn't anticipate: keep the stack trace so it's debuggable.
    console.error(err);
  }
  process.exit(1);
});
