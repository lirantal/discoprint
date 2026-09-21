# Architecture

How the pieces fit together, and why they're split the way they are. If
you're about to change how data flows through this app, read this first —
the split exists on purpose and most "obvious" simplifications (call
`console.log` directly, skip the event layer, merge the two dashboards)
were tried, hit a real problem, and were reverted. See
[decisions.md](decisions.md) for the specific incidents.

## The three layers

```text
src/pipeline.ts            business logic — resolves artist, fetches
                            discography/lyrics, classifies songs. Emits
                            PipelineEvent, touches nothing terminal-related.
src/pipeline-events.ts     the event contract between pipeline.ts and
                            everything downstream.
src/bin/cli.ts             picks a consumer for the event stream based on
                            --verbose / TTY / CI, and owns argv parsing.
src/tui/                   the Ink live view + the Ink final dashboard.
src/viz/                   the plain-text renderer (render-terminal.ts) and
                            the shared, renderer-agnostic data shaping
                            (data.ts) both the plain and Ink dashboards read.
```

**`runPipeline()` never touches the terminal.** Not `console.log`, not
`process.stdout`, nothing. It calls `options.onEvent?.(event)` for every
observable thing that happens (artist resolved, a MusicBrainz retry, a song
classified) and returns `void`. This is the single most important
invariant in the codebase — see [decisions.md § event-driven
pipeline](decisions.md#why-the-pipeline-emits-events-instead-of-printing)
for why, and don't reach for `console.log` inside `pipeline.ts`,
`musicbrainz.ts`, or `lrclib.ts` to "just quickly print something." Add an
event instead (see [tui.md § adding a new event](tui.md#adding-a-new-pipelineevent)).

`src/bin/cli.ts`'s `runClassifyCommand()` picks exactly one of three
consumers per run:

| Mode                          | Consumer                                                       | When                              |
| ----------------------------- | -------------------------------------------------------------- | --------------------------------- |
| Animated (default)            | `runClassifyUI()` mounts the Ink `<App>` (`src/tui/App.tsx`)   | `canAnimate()` — real TTY, not CI |
| Verbose                       | `createPlainLogger()` — plain `console.log` per event          | `--verbose`, any environment      |
| Quiet (default, non-animated) | `logRetriesOnly()` — silence except MusicBrainz retry warnings | non-TTY / CI, no `--verbose`      |

All three call the exact same `runPipeline()`. None of them can observe
anything the other two can't — they just choose different amounts of it to
show.

## The two dashboards

There are two independent implementations of "render a classified
discography":

- **`src/viz/render-terminal.ts`** — pure functions producing ANSI-embedded
  strings, printed with `console.log`. Used by `discoprint visualize`,
  `--verbose`, and non-TTY output.
- **`src/tui/dashboard/`** — Ink components (`<Box>`/`<Text>`) producing the
  same dashboard, used by the animated live view once a run finishes (see
  [tui.md § the final dashboard](tui.md#the-final-dashboard)).

They are **not** the same code with two output modes — Ink components
can't consume pre-built ANSI strings without breaking Ink's own
width/wrapping math (this was tried; see decisions.md). What they _do_
share:

- **`src/viz/data.ts`** — `buildVisualizationData()`/`loadVisualizationData()`
  turn raw `SongClassification[]` into the renderer-agnostic
  `VisualizationData` shape (sorted songs, album groups with averages,
  theme distribution, date range). Pure, no I/O in the `build*` half. Both
  renderers consume the exact same shape.
- **Color/math logic**: `resample()`/`average()` (`viz/data.ts`),
  `moodGradientHex()`/`clamp()`/`mixHex()` (`viz/colors.ts`), `themeColor()`
  (`viz/theme-palette.ts`). `src/tui/dashboard/bars.ts` is a from-scratch
  but parallel port of `render-terminal.ts`'s bar/glyph math — it returns
  `{ char, color }` data instead of ANSI strings, which is what Ink
  actually needs. **If you change how a bar/sparkline/glyph is computed in
  one, change it in the other too** — there's no shared function for this
  specific piece, only shared _primitives_ underneath it.
- **`src/viz/classification-averages.ts`** — which rows the
  theme/mood/complexity/explicit/first-person readout has, how each is
  labeled, the scale each is drawn against, and `statBarFill()`. Unlike
  `bars.ts` above, this one genuinely is shared by all three places that
  draw those rows (the live `SpotlightPanel`, the dashboard's
  `AveragesPanel`, and `render-terminal.ts`'s plain-text block) — a row
  that appeared in one but not another would be visible to the user at
  the exact moment the live view settles.
- **`src/format.ts`** — `formatTokenCount()`/`formatDuration()`/`formatUsd()`,
  used by `render-terminal.ts`, `tui/StatsFooter.tsx`, and
  `tui/dashboard/JevUsageFooter.tsx`. This one genuinely is shared (no
  reason for it not to be — no ANSI/Ink-specific concerns in plain number
  formatting).

If you add a new piece of information to the dashboard, it needs to be
added to `VisualizationData` (or `ClassificationRunMeta`), then to _both_
renderers, with a test for the pure logic and a real terminal check for the
Ink side (unit tests can't catch Ink layout bugs — see
[testing.md § Ink has no unit tests](testing.md#ink-components-have-no-unit-tests)).

## Where things live

| Concern                                      | File(s)                                                      |
| -------------------------------------------- | ------------------------------------------------------------ |
| CLI argv parsing, mode selection             | `src/bin/cli.ts`                                             |
| Interactive text prompts (Ink + @inkjs/ui)   | `src/prompt.tsx`                                             |
| TTY/CI detection                             | `src/tty.ts` (shared by `prompt.tsx` and the Ink path)       |
| MusicBrainz client (search, discography)     | `src/musicbrainz.ts`                                         |
| lrclib client (lyrics)                       | `src/lrclib.ts`                                              |
| Jev/TypeSafe integration                     | `src/jev.ts` — see [jev-integration.md](jev-integration.md)  |
| Orchestration + caching + event emission     | `src/pipeline.ts`                                            |
| Event contract                               | `src/pipeline-events.ts`                                     |
| Error → friendly message mapping             | `src/errors.ts`                                              |
| Disk cache helpers, slugify, etc.            | `src/util.ts`                                                |
| Data dir resolution (XDG default + override) | `src/paths.ts`                                               |
| Renderer-agnostic data shaping               | `src/viz/data.ts`                                            |
| Cross-renderer stat rows + bar math          | `src/viz/classification-averages.ts`                         |
| Shared TUI width/column geometry             | `src/tui/layout.ts` — see [tui.md](tui.md)                   |
| Plain-text dashboard                         | `src/viz/render-terminal.ts`                                 |
| Color/theme palette                          | `src/viz/colors.ts`, `src/viz/theme-palette.ts`              |
| Live Ink view + state machine                | `src/tui/App.tsx`, `src/tui/state.ts` — see [tui.md](tui.md) |
| Ink final dashboard                          | `src/tui/dashboard/`                                         |
| Shared number formatting                     | `src/format.ts`                                              |

## Data on disk

`<data dir>` defaults to `$XDG_CONFIG_HOME/discoprint` (falling back to
`~/.config/discoprint`), resolved by `resolveDataDir()` in `src/paths.ts`.
Override with `--data-dir PATH` or `DISCOPRINT_DATA_DIR`.

```text
<data dir>/cache/musicbrainz/<artist-slug>.json                       full discography
<data dir>/cache/lyrics/<artist-slug>/<track-slug>.json                per-track lyrics
<data dir>/cache/classification/<artist-slug>/<track-slug>.json        per-track Jev result
<data dir>/output/<artist-slug>.json                                   final SongClassification[]
<data dir>/output/<artist-slug>-skipped.json                           tracks with no lyrics found
<data dir>/output/<artist-slug>-meta.json                               ClassificationRunMeta (last run's stats)
```

See [caching.md](caching.md) for exactly when each is read/written/invalidated.
