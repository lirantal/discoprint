# artist-lyrics-classifier

Classify an artist's entire discography by theme, mood, lyrical complexity and a
couple of content flags — using [Jev](https://docs.typesafe.ai/introduction)
(TypeSafe's structured-decision model) instead of an LLM you'd have to parse.

## How it works

1. **[MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API)** — free, keyless — resolves the artist name
   to an ID and pulls their full album/EP discography with release dates.
2. **[lrclib.net](https://lrclib.net/docs)** — free, keyless, community lyrics database — fetches plain lyrics
   per track. Tracks with no match are skipped (recorded in `*-skipped.json`).
3. **Jev** classifies each song against 5 atomic questions, batched into a single
   `systemOne` call per track (see [Classifiers](#classifiers) below).

Every stage is cached to disk under `data/cache/`, so re-runs are incremental and
you can safely interrupt a long run (MusicBrainz is rate-limited to 1 req/sec, so
a big discography takes a few minutes just for step 1).

## Classifiers

Defined in [src/jev.ts](src/jev.ts) — this is the source of truth; update this table
if you change the questions there. All five are sent together as one `systemOne` call
per song, with `state = { artist, track, lyrics }` (see TypeSafe's
[parallel questions cookbook](https://docs.typesafe.ai/cookbooks/parallel_questions)
on why batching like this beats one call per question).

| Field         | Primitive                                              | Question                                                                                               | Options / rubric                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme`       | [Choice](https://docs.typesafe.ai/primitives/choice)   | What is the primary theme of these song lyrics?                                                        | `love` — romantic love, desire, or devotion · `heartbreak` — breakup, longing, or lost love · `party_fun` — partying, dancing, or having a good time · `money_success` — wealth, fame, ambition, or success · `social_political` — social commentary, injustice, or politics · `loss_grief` — death, mourning, or grief · `self_reflection` — introspection, identity, or personal growth · `other` — doesn't clearly fit the above |
| `mood`        | [Score](https://docs.typesafe.ai/primitives/score) 0–4 | How positive or upbeat is the emotional tone of these lyrics?                                          | 0 very dark/sad/despairing · 1 melancholic/downbeat · 2 neutral/mixed · 3 positive/hopeful · 4 joyful/euphoric/triumphant                                                                                                                                                                                                                                                                                                           |
| `complexity`  | [Score](https://docs.typesafe.ai/primitives/score) 0–3 | How lyrically dense or literary is the language in these lyrics?                                       | 0 very simple/repetitive · 1 straightforward/plain · 2 some figurative language or wordplay · 3 rich in metaphor, imagery, or literary technique                                                                                                                                                                                                                                                                                    |
| `explicit`    | [Noul](https://docs.typesafe.ai/primitives/noul) 0–1   | These lyrics contain profanity or explicit sexual content.                                             | probability of yes                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `firstPerson` | [Noul](https://docs.typesafe.ai/primitives/noul) 0–1   | These lyrics are narrated from a personal, first-person perspective about the singer's own experience. | probability of yes                                                                                                                                                                                                                                                                                                                                                                                                                  |

`Choice` and `Score` answers also come back with a `confidence` (0–1), which is
recorded alongside each value as `themeConfidence`, `moodConfidence` and
`complexityConfidence`. The full row shape per song lives in
[src/types.ts](src/types.ts) (`SongClassification`) and is what lands in
`data/output/<artist-slug>.json`.

## Visualizing results

```bash
npm run visualize -- "Bon Jovi"   # reads data/output/<artist-slug>.json
npm run visualize                 # no artist given -> interactive prompt
```

Renders a small terminal dashboard from already-classified data (no network
calls, no API key needed):

- **header** — song/skipped counts and release-date range
- **mood arc** — one line, whole discography, chronological: a colored
  sparkline (red → yellow → green) of `mood` over time
- **theme legend + mix bar** — which themes appear, and their proportion
  across the discography
- **heatmap** — adaptive to your terminal size instead of a fixed layout:
  - fits in the terminal → **one row per song**: a theme-colored swatch, the
    title, a mood bar, and a complexity glyph
  - too many songs to fit → **one row per album** instead, each with a
    fixed-width strip of theme-colored blocks (one per song) plus the
    album's averaged mood/complexity — so a 200-song discography still
    renders in a couple dozen lines, no scrolling

Color is truecolor ANSI (24-bit), disabled automatically when `NO_COLOR` is
set or output isn't a TTY (e.g. piped to a file).

**Built for a second renderer.** [src/viz/data.ts](src/viz/data.ts) turns raw
`SongClassification[]` into a renderer-agnostic `VisualizationData` shape
(sorted songs, album groups with averages, theme distribution, date range) —
pure functions, no terminal/HTML concerns. [src/viz/render-terminal.ts](src/viz/render-terminal.ts)
is the only piece that knows about ANSI codes and terminal width; a future
`render-html.ts` would consume the exact same `VisualizationData` to produce
a self-contained HTML file instead. [src/viz/theme-palette.ts](src/viz/theme-palette.ts)
and [src/viz/colors.ts](src/viz/colors.ts) (hex colors, gradient interpolation)
are renderer-independent too, so an HTML version would reuse the same palette
and just emit CSS instead of ANSI escapes.

## Setup

```bash
npm install
```

Env vars are managed with [Varlock](https://varlock.dev): [.env.schema](.env.schema) declares
`TYPESAFE_API_KEY` (committed, no secret in it) and a local, gitignored `.env` supplies the
real value — either a literal key or a 1Password reference, resolved at load time via the
`op` CLI:

```bash
# .env (create this yourself, it's gitignored)

# option A: paste your key from https://console.typesafe.ai/keys directly
TYPESAFE_API_KEY=sk-...

# option B: a 1Password secret reference, resolved on load (requires the `op`
# CLI installed and the 1Password desktop app running/unlocked for app auth)
TYPESAFE_API_KEY=op(op://Personal/typesafe/api_key)
```

Run `varlock load` any time to check what resolves without running the whole pipeline.

Before real use, edit the `USER_AGENT` string in [src/musicbrainz.ts](src/musicbrainz.ts)
to include your own contact info/repo URL — MusicBrainz requires this.

## Usage

```bash
# interactive: run with no args in a terminal and it'll ask for the artist,
# then a song limit (defaults to 100 if you just hit enter)
npm run classify

# non-interactive: pass the artist directly (limit is unbounded unless given)
npm run classify -- "Radiohead" --limit 10

# full discography
npm run classify -- "Radiohead"

# include singles/live albums/compilations too (default: albums + EPs only)
npm run classify -- "Radiohead" --include-non-albums

# re-classify ignoring cached results
npm run classify -- "Radiohead" --force
```

The interactive prompt (in the look & feel of
[lirantal/boxdown](https://github.com/lirantal/boxdown)'s prompts — see
[src/prompt.ts](src/prompt.ts)) only kicks in when no artist is given _and_
you're in a real terminal; in CI or a piped/non-TTY invocation with no artist,
it prints the usage line and exits instead of hanging on input.

Output lands in `data/output/<artist-slug>.json` — one row per track with all
five classifications, ready to chart (e.g. mood/complexity over time, theme
distribution per album).

## Error handling

[src/errors.ts](src/errors.ts) maps predictable failures to a plain message
instead of a stack trace — anything not on this list still prints its full
stack trace so it stays debuggable:

- artist name not found on MusicBrainz (typo, or too obscure) → suggests checking the spelling
- MusicBrainz/lrclib/TypeSafe unreachable (no internet, DNS failure)
- MusicBrainz request failures (after exhausting 503 retries — see below)
- TypeSafe API errors: bad/expired key, rate limited, permission denied, or a generic API error, each with its own SDK error class (`AuthenticationError`, `RateLimitError`, etc.) mapped to specific guidance
- an invalid `--limit` value (e.g. `--limit abc`)

## Testing

No test framework dependency — just the built-in [node:test](https://nodejs.org/api/test.html)
runner (via `tsx` so it can load `.ts` files with the project's `.js`-suffixed import style)
and `node:assert`. Every network boundary (MusicBrainz, lrclib, the TypeSafe API) is mocked
by stubbing `globalThis.fetch` per test with `t.mock.method`; nothing hits the real internet.

```bash
npm test              # run everything once
npm run test:coverage # same, plus a line/branch/function coverage report
```

- [src/util.test.ts](src/util.test.ts) — pure functions (`slugify`, `normalizeTrackTitle`) and the disk-cache round trip
- [src/musicbrainz.test.ts](src/musicbrainz.test.ts) — artist resolution, release-group filtering (compilations excluded), title dedup across reissues
- [src/lrclib.test.ts](src/lrclib.test.ts) — the `/get` → `/search` fallback chain, instrumental tracks, no-match handling
- [src/jev.test.ts](src/jev.test.ts) — asserts the exact request sent to `systemOne` (state shape, all 5 questions batched) and that the response maps correctly onto `SongClassification`
- [src/errors.test.ts](src/errors.test.ts) — every mapped error case in `describeError`, plus the fallback for anything unrecognized
- [src/musicbrainz-retry-limit.test.ts](src/musicbrainz-retry-limit.test.ts) — retry exhaustion on a persistent 503, isolated in its own file/process (see the comment in it for why)
- [src/prompt.test.ts](src/prompt.test.ts) — the interactive text prompt: TTY/CI detection, validation retries, default-value fallback, cancellation
- [src/pipeline.test.ts](src/pipeline.test.ts) — full integration run against a temp directory: fresh run, cached rerun (only artist resolution hits the network), `--force`, `--limit`
- [src/viz/colors.test.ts](src/viz/colors.test.ts), [src/viz/data.test.ts](src/viz/data.test.ts) — color interpolation and the pure data-shaping/aggregation logic
- [src/viz/render-terminal.test.ts](src/viz/render-terminal.test.ts) — adaptive per-song/per-album view selection, column alignment, and edge cases (0 songs, 1 song, very long titles)

`test:coverage` writes an LCOV report to `coverage/lcov.info` (gitignored) — pipe it into
your editor's coverage gutters or `genhtml` for an HTML view. `src/index.ts` (the argv-parsing
CLI shell) is excluded since it's a thin wrapper with no logic worth mocking `process.exit` for.

## Notes / limitations

- lrclib is community-sourced; some tracks (especially deep cuts or non-English
  releases) won't have lyrics.
- Title deduping across reissues/remasters/deluxe editions is a heuristic
  (see `normalizeTrackTitle` in [src/util.ts](src/util.ts)) — spot-check the
  discography cache if you need exact coverage for an artist with many reissues.
- Costs scale with API pricing per `systemOne` call; each track is one call
  batching all 5 questions (much cheaper than 5 separate calls — see TypeSafe's
  [parallel questions cookbook](https://docs.typesafe.ai/cookbooks/parallel_questions)).
- MusicBrainz occasionally returns `503` even when you're well within the 1
  req/sec limit — per their own docs that specifically means "rate limited,"
  usually from other traffic sharing your egress IP (common on shared/cloud
  dev environments). [src/musicbrainz.ts](src/musicbrainz.ts) retries a `503`
  with exponential backoff (5 attempts by default) before giving up.
