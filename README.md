<!-- markdownlint-disable -->

<p align="center">
  <h1 align="center">
    discoprint
  </h1>
</p>

<p align="center">
  Classify an artist's discography by theme, mood, and lyrical complexity with Jev (TypeSafe AI), and view it as a colorful terminal dashboard.
</p>

<img width="1640" height="1157" alt="SCR-20260923-iwuq" src="https://github.com/user-attachments/assets/4902e4a4-cc84-4180-b61f-bed6128ef5ce" />

<p align="center">
  <a href="https://www.npmjs.com/package/discoprint"><img src="https://badgen.net/npm/v/discoprint" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/discoprint"><img src="https://badgen.net/npm/license/discoprint" alt="license"/></a>
  <a href="https://www.npmjs.com/package/discoprint"><img src="https://badgen.net/npm/dt/discoprint" alt="downloads"/></a>
  <a href="https://github.com/lirantal/discoprint/actions/workflows/ci.yml"><img src="https://github.com/lirantal/discoprint/actions/workflows/ci.yml/badge.svg?branch=main" alt="build"/></a>
  <a href="https://app.codecov.io/gh/lirantal/discoprint"><img src="https://badgen.net/codecov/c/github/lirantal/discoprint" alt="codecov"/></a>
  <a href="./SECURITY.md"><img src="https://img.shields.io/badge/Security-Responsible%20Disclosure-yellow.svg" alt="Responsible Disclosure Policy" /></a>
</p>

## Install

```sh
npm install -g discoprint
```

Or run it without installing:

```sh
npx discoprint "Bon Jovi"
```

## Usage: CLI

```bash
# classify an artist's discography, then immediately show the dashboard
discoprint "Bon Jovi"

# no artist given, in a real terminal -> prompts for artist + song limit
discoprint

# classify only, skip the auto-visualization (useful for scripting)
discoprint "Bon Jovi" --no-visualize

# re-render the dashboard from already-classified data, no network calls
discoprint visualize "Bon Jovi"
```

## Demo



https://github.com/user-attachments/assets/34cc8af4-c58e-48e4-9b8f-de66e1fe69b5

### API key

Classifying needs a [TypeSafe](https://console.typesafe.ai/keys) API key (Jev). If
`TYPESAFE_API_KEY` isn't set — in your shell, a `.env` in the current directory, or wherever
else your environment normally sources it from — the CLI prompts for it interactively (masked,
like a password) and uses it for that run only; it's never written to disk. To skip the prompt
every time, either export it in your shell profile:

```bash
export TYPESAFE_API_KEY=sk-...
```

or drop it in a `.env` file in the directory you run `discoprint` from:

```bash
# .env
TYPESAFE_API_KEY=sk-...
```

Inside a clone of this repo, you can instead use a
[1Password](https://1password.com) secret reference — see
[Local development setup](#local-development-setup) below. That form only resolves where
[@varlock/1password-plugin](https://www.npmjs.com/package/@varlock/1password-plugin) is
actually installed (a repo clone); elsewhere (a global/`npx` install) it fails the same way
an unset key does, falling through to the interactive prompt above.

Flags for the classify path: `--limit N` (default 100 when prompted interactively,
unbounded otherwise), `--include-non-albums` (include singles/live albums/compilations,
default is albums + EPs only), `--force` (re-classify ignoring cached results),
`--verbose` (print per-step progress — artist resolution, discography fetch, one
line per song — instead of just the one-line summary shown by default), `--data-dir PATH`
(where cache/output files live — see [Caching](#caching) below).

In a real terminal, classifying is one continuous [Ink](https://github.com/vadimdemedes/ink)
app (`src/tui/`), not a live animation that hands off to a separate
plain-text dashboard afterward. While work is happening: a status header
(artist, current phase, elapsed time), a scrolling log of songs classified
so far, a spotlight panel that reveals each result's theme/mood/complexity/
explicit/first-person as it lands, a running theme legend, and an aggregate
stats footer. The log scrolls in place once it outgrows the terminal
instead of endlessly printing new lines, so a 200-song run renders the same
frame size as a 5-song one.

Since lyrics are already on disk by the time classification starts, songs
classify concurrently instead of one at a time — including ones already
cached, which cost nothing and take no real time, but still go through the
same started/completed events a fresh Jev call would. The spotlight panel
paces itself against how many songs there are (not how fast they actually
completed), so it always plays through every result one at a time — a
fully-cached rerun gets the same animated walkthrough as a brand-new
classify run, instead of skipping straight to the end for lack of anything
to visibly wait on.

Once done, that live view settles and morphs into the same dashboard
(an OVERVIEW panel with the mood arc and theme mix, a CLASSIFICATION
AVERAGE panel, a DISCOGRAPHY grid, a SONGS panel with the adaptive
per-song/per-album table, a usage footer) that `discoprint visualize`
shows — same content, same boxed
visual style as the live view's own panels throughout, not a fallback to
plain text — committed permanently to your scrollback (via Ink's
`<Static>`) rather than erased when the app exits. That averages panel is
the spotlight's own five rows — same component, same width, same column on
screen — only describing every song at once instead of the one that just
landed, so finishing a run changes what the panel says rather than
shuffling the layout around it. `--verbose`, CI, and non-TTY output (e.g.
piped to a file) skip the live view and print a plain-text progress log
followed by the same final dashboard instead.

## How it works

1. **[MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API)** — free, keyless — resolves the artist name
   to an ID and pulls their full album/EP discography with release dates.
2. **[lrclib.net](https://lrclib.net/docs)** — free, keyless, community lyrics database — fetches plain lyrics
   per track. Tracks with no match are skipped (recorded in `*-skipped.json`).
3. **Jev** classifies each song against 5 atomic questions, batched into a single
   `systemOne` call per track (see [Classifiers](#classifiers) below).

Every stage is cached to disk under `<data dir>/cache/`, so re-runs are incremental
and you can safely interrupt a long run (MusicBrainz is rate-limited to 1 req/sec,
so a big discography takes a few minutes just for step 1). See [Caching](#caching)
below for exactly what's cached and what re-triggers a real network call.

## Caching

By default, `<data dir>` is `$XDG_CONFIG_HOME/discoprint` (falling back to
`~/.config/discoprint`) — not the directory you happen to run `discoprint`
from, so it stays out of the way of whatever project you're in. Override it
with `--data-dir PATH` or the `DISCOPRINT_DATA_DIR` environment variable.

| Step                                 | Cached?                 | Where                                                                    | Re-fetched by                                                |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Resolve artist name → MusicBrainz ID | No — always a live call | —                                                                        | every run, unconditionally                                   |
| Fetch discography (albums/tracks)    | Yes                     | `<data dir>/cache/musicbrainz/<artist-slug>.json`                        | `--force`                                                    |
| Fetch lyrics per song                | Yes                     | `<data dir>/cache/lyrics/<artist-slug>/<track-slug>.json`                | nothing — delete the file yourself to retry a specific track |
| Classify a song with Jev             | Yes                     | `<data dir>/cache/classification/<artist-slug>/<track-slug>.json`        | `--force`                                                    |
| Final output                         | —                       | `<data dir>/output/<artist-slug>.json` (+ `-skipped.json`, `-meta.json`) | rewritten on every run from whatever was cached/fetched      |

So `discoprint "Bon Jovi" --limit 10`, once those 10 songs are already
classified, makes exactly one real network call (the artist lookup) and
serves everything else from disk — no lrclib or Jev calls, no cost. Raising
`--limit` only fetches/classifies the _additional_ songs beyond what's
cached. `--force` re-fetches the discography and re-classifies every song
in scope, but still reuses cached lyrics (there's no automatic invalidation
for those — lyrics don't change, so the only way to retry a track's lyrics
lookup is deleting its cache file).

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
`<data dir>/output/<artist-slug>.json`.

## Visualizing results

```bash
discoprint visualize "Bon Jovi"   # reads <data dir>/output/<artist-slug>.json
discoprint visualize              # no artist given -> interactive prompt
```

Renders a small terminal dashboard from already-classified data (no network
calls, no API key needed) — and `discoprint "Artist"` (no subcommand) shows it
automatically right after classifying:

- **header** — song/skipped counts and release-date range
- **mood arc** — one line, whole discography, chronological: a colored
  sparkline (red → yellow → green) of `mood` over time, with a key using the
  same character ramp so the gradient is self-explanatory
- **theme legend + mix bar** — which themes appear (out of the 8 possible),
  their exact share, and the same proportions as a stacked bar
- **classification average** — the same theme/mood/complexity/explicit/
  first-person rows the live view reveals per song, averaged across the
  whole discography: the artist's overall lean, in the same bars you
  watched fill in one song at a time
- **discography grid** — a GitHub-contributions-style grid, one swatch per
  classified song in chronological order and colored by theme, wrapping to
  fill the terminal width, plus a row of at-a-glance stats (songs, albums,
  years active, top theme, avg mood, busiest album)
- **heatmap** — adaptive to your terminal size instead of a fixed layout:
  - fits in the terminal → **one row per song**: a theme-colored swatch, the
    title, a mood bar, and a complexity glyph
  - too many songs to fit → **one row per album** instead, each with a
    fixed-width strip of theme-colored blocks (one per song) plus the
    album's averaged mood/complexity — so a 200-song discography still
    renders in a couple dozen lines, no scrolling
- **jev usage footer** — stats from the most recent classify run: song count,
  resolved model (e.g. `jev-1.13.0` — the concrete version behind the
  `jev-latest` alias), input/output tokens, estimated cost, and time spent
  classifying. Read from `<data dir>/output/<artist-slug>-meta.json`, so it shows
  up even on a `visualize`-only invocation that makes no API calls itself. If
  the last run was fully served from cache, it says so instead of showing
  zeroes.

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

The same split applies to the _live_ classify view: [src/pipeline.ts](src/pipeline.ts)
never touches the terminal — it reports progress as a plain `PipelineEvent`
stream ([src/pipeline-events.ts](src/pipeline-events.ts)) and stays exactly as
testable as before. [src/bin/cli.ts](src/bin/cli.ts) picks a consumer for
that stream: the [src/tui/](src/tui) Ink dashboard interactively, a
plain-text logger for `--verbose`/non-TTY output, or nothing for the default
quiet summary. [src/tui/state.ts](src/tui/state.ts) is a pure
`(AppState, PipelineEvent) -> AppState` reducer with no Ink/React
dependency, so the dashboard's state machine is unit-tested the same way as
everything else in this project.

Once a run is done, [src/tui/App.tsx](src/tui/App.tsx) loads the exact same
`VisualizationData` `render-terminal.ts` does, but hands it to
[src/tui/dashboard/](src/tui/dashboard) — an Ink re-implementation of the
same dashboard (mood arc, theme legend/mix bar, discography grid, adaptive
song/album table, usage footer), styled like the rest of the live view (the
same rounded-box `SONGS` panel, the same colors) rather than falling back to
plain `console.log` text once the animation stops. The two renderers share
their _data and color logic_ — `resample()`/`average()` from `viz/data.ts`,
`moodGradientHex()` from `viz/colors.ts`, `themeColor()` from
`viz/theme-palette.ts`, the discography stats/layout math in
[src/viz/discography-grid.ts](src/viz/discography-grid.ts), and the
bar/glyph math in
[src/tui/dashboard/bars.ts](src/tui/dashboard/bars.ts) (a pure, unit-tested
port of `render-terminal.ts`'s own bar math, returning `{ char, color }`
data instead of ANSI-embedded strings) — but each renders it through its
own primitives (ANSI strings vs. Ink's `<Text>`/`<Box>`), the same
renderer-agnostic split the "Built for a second renderer" section above
describes. `--verbose`/non-TTY output still ends with the plain-text
dashboard, same as before — the Ink one only replaces what the live view
morphs into.

## Local development setup

```bash
git clone https://github.com/lirantal/discoprint.git
cd discoprint
pnpm install
pnpm run prepare   # sets up git hooks; skipped automatically by `ignore-scripts` in .npmrc
```

Env vars are managed with [Varlock](https://varlock.dev): [.env.schema](.env.schema) declares
`TYPESAFE_API_KEY` (committed, no secret in it) and a local, gitignored `.env` supplies the
real value — either a literal key or a 1Password reference, resolved at load time via
[@varlock/1password-plugin](https://www.npmjs.com/package/@varlock/1password-plugin):

```bash
# .env (create this yourself, it's gitignored)

# option A: paste your key from https://console.typesafe.ai/keys directly
TYPESAFE_API_KEY=sk-...

# option B: a 1Password secret reference, resolved on load (requires the `op`
# CLI installed and the 1Password desktop app running/unlocked for app auth,
# or OP_SERVICE_ACCOUNT_TOKEN set for headless auth — see .env.schema)
TYPESAFE_API_KEY=op(op://Personal/typesafe/api_key)
```

(Or skip the `.env` file entirely and just let the CLI prompt you for it interactively —
see [API key](#api-key) above.)

Run `pnpm exec varlock load` any time to check what resolves without running the whole pipeline.

Before real use, edit the `USER_AGENT` string in [src/musicbrainz.ts](src/musicbrainz.ts)
to include your own contact info/repo URL — MusicBrainz requires this.

See [DEVELOPMENT.md](./DEVELOPMENT.md) for running the CLI from source and for
building/linking `discoprint` as a real global command.

The interactive prompt (built on [Ink](https://github.com/vadimdemedes/ink) and
[@inkjs/ui](https://github.com/vadimdemedes/ink-ui) — see
[src/prompt.tsx](src/prompt.tsx)) only kicks in when no artist is given _and_
you're in a real terminal; in CI or a piped/non-TTY invocation with no artist,
it prints the usage line and exits instead of hanging on input.

Output lands in `<data dir>/output/<artist-slug>.json` — one row per track with all
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
pnpm test              # run everything once
pnpm run test:coverage # same, plus a line/branch/function coverage report
```

- [src/util.test.ts](src/util.test.ts) — pure functions (`slugify`, `normalizeTrackTitle`) and the disk-cache round trip
- [src/musicbrainz.test.ts](src/musicbrainz.test.ts) — artist resolution, release-group filtering (compilations excluded), title dedup across reissues
- [src/lrclib.test.ts](src/lrclib.test.ts) — the `/get` → `/search` fallback chain, instrumental tracks, no-match handling
- [src/jev.test.ts](src/jev.test.ts) — asserts the exact request sent to `systemOne` (state shape, all 5 questions batched) and that the response maps correctly onto `SongClassification`
- [src/errors.test.ts](src/errors.test.ts) — every mapped error case in `describeError`, plus the fallback for anything unrecognized
- [src/musicbrainz-retry-limit.test.ts](src/musicbrainz-retry-limit.test.ts) — retry exhaustion on a persistent 503, isolated in its own file/process (see the comment in it for why)
- [src/prompt.test.ts](src/prompt.test.ts) — the interactive text prompt: TTY/CI detection, validation retries, default-value fallback, cancellation
- [src/pipeline.test.ts](src/pipeline.test.ts) — full integration run against a temp directory: fresh run, cached rerun (only artist resolution hits the network), `--force`, `--limit`, the `onEvent` progress stream (order, optionality, a failure mid-classify), and that concurrent classification is actually concurrent (wall time less than the sum of the individual calls)
- [src/tui/state.test.ts](src/tui/state.test.ts) — the live dashboard's state machine (`PipelineEvent -> AppState`), tested as a plain reducer with no Ink/React involved
- [src/tui/dashboard/bars.test.ts](src/tui/dashboard/bars.test.ts) — the final dashboard's bar/glyph/sparkline math, tested as plain functions returning `{ char, color }` data, no Ink rendering involved
- [src/format.test.ts](src/format.test.ts) — token/duration/cost formatting shared by every renderer
- [src/viz/colors.test.ts](src/viz/colors.test.ts), [src/viz/data.test.ts](src/viz/data.test.ts) — color interpolation and the pure data-shaping/aggregation logic
- [src/viz/discography-grid.test.ts](src/viz/discography-grid.test.ts) — discography grid layout math (columns/rows/hidden count) and the at-a-glance stats
- [src/viz/render-terminal.test.ts](src/viz/render-terminal.test.ts) — adaptive per-song/per-album view selection, column alignment, and edge cases (0 songs, 1 song, very long titles)

`test:coverage` writes an LCOV report to `coverage/lcov.info` (gitignored) — pipe it into
your editor's coverage gutters or `genhtml` for an HTML view. `src/bin/cli.ts` and
`src/main.ts` (the CLI shell and the library re-export surface) are excluded since
they're thin wrappers with no logic worth mocking `process.exit` for.

## Notes / limitations

- lrclib is community-sourced; some tracks (especially deep cuts or non-English
  releases) won't have lyrics.
- Title deduping across reissues/remasters/deluxe editions is a heuristic
  (see `normalizeTrackTitle` in [src/util.ts](src/util.ts)) — spot-check the
  discography cache if you need exact coverage for an artist with many reissues.
- Costs scale with API pricing per `systemOne` call; each track is one call
  batching all 5 questions (much cheaper than 5 separate calls — see TypeSafe's
  [parallel questions cookbook](https://docs.typesafe.ai/cookbooks/parallel_questions)).
  The cost shown in the "jev usage" footer is estimated client-side from
  input-token count × the [published per-million-token price](https://docs.typesafe.ai/models.md)
  (output tokens are free) — the API itself doesn't return a cost field. See
  the pricing constant in [src/jev.ts](src/jev.ts) if TypeSafe's rate changes.
- MusicBrainz occasionally returns `503` even when you're well within the 1
  req/sec limit — per their own docs that specifically means "rate limited,"
  usually from other traffic sharing your egress IP (common on shared/cloud
  dev environments). [src/musicbrainz.ts](src/musicbrainz.ts) retries a `503`
  with exponential backoff (5 attempts by default) before giving up.

## Contributing

Please consult [CONTRIBUTING](./CONTRIBUTING.md) for guidelines on contributing to this project.

## Author

**discoprint** © [Liran Tal](https://github.com/lirantal), Released under the [Apache-2.0](./LICENSE) License.
