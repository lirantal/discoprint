// Loads .env.schema + any local .env (resolving op:// 1Password references
// and other resolver functions) and validates against the schema before
// anything else runs. See .env.schema and https://varlock.dev.
import "varlock/auto-load";

import { runPipeline } from "./pipeline.js";
import { canPromptInteractively, promptText } from "./prompt.js";

const DEFAULT_LIMIT = 100;

function parseArgs(argv: string[]) {
  const args = { artist: "", limit: undefined as number | undefined, includeNonAlbums: false, force: false };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit") {
      args.limit = Number(argv[++i]);
    } else if (arg === "--include-non-albums") {
      args.includeNonAlbums = true;
    } else if (arg === "--force") {
      args.force = true;
    } else {
      positional.push(arg);
    }
  }

  args.artist = positional.join(" ");
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.artist) {
    if (!canPromptInteractively()) {
      console.error(
        'Usage: npm run classify -- "Artist Name" [--limit N] [--include-non-albums] [--force]',
      );
      process.exit(1);
    }

    const artistAnswer = await promptText({
      title: "Which artist or band?",
      summaryLabel: "Artist",
      validate: (value) => (value === "" ? "Enter an artist name." : undefined),
    });
    if (artistAnswer.status === "cancelled") {
      process.exit(1);
    } else {
      args.artist = artistAnswer.value;
    }

    if (args.limit === undefined) {
      const limitAnswer = await promptText({
        title: "How many songs to classify?",
        summaryLabel: "Limit",
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

  await runPipeline(args.artist, {
    limit: args.limit,
    includeNonAlbums: args.includeNonAlbums,
    force: args.force,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
