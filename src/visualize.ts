// Deliberately doesn't load varlock/auto-load: visualizing already-cached
// classification data needs no API key at all.
import { join } from "node:path";
import { describeError } from "./errors.js";
import { canPromptInteractively, promptText } from "./prompt.js";
import { slugify } from "./util.js";
import { loadVisualizationData } from "./viz/data.js";
import { renderTerminal } from "./viz/render-terminal.js";

const OUTPUT_DIR = join(process.cwd(), "data", "output");

async function resolveArtist(argv: string[]): Promise<string> {
  const artist = argv.join(" ").trim();
  if (artist) return artist;

  if (!canPromptInteractively()) {
    console.error('Usage: npm run visualize -- "Artist Name"');
    process.exit(1);
  }

  const answer = await promptText({
    title: "Which artist's classification data do you want to visualize?",
    summaryLabel: "Artist",
    validate: (value) => (value === "" ? "Enter an artist name." : undefined),
  });
  if (answer.status === "cancelled") {
    process.exit(1);
  }

  return answer.value;
}

async function main() {
  const artist = await resolveArtist(process.argv.slice(2));
  const data = await loadVisualizationData(OUTPUT_DIR, slugify(artist), artist);

  console.log();
  for (const line of renderTerminal(data)) {
    console.log(line);
  }
  console.log();
}

main().catch((err) => {
  const described = describeError(err);
  if (described.known) {
    console.error(described.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
