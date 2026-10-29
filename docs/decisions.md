# Decisions

Why things are built the way they are, in enough detail that "just
simplify this" doesn't quietly reintroduce a bug that was already found
and fixed once. Each entry: what problem it solves, what was tried first,
and why that didn't work.

## Why the pipeline emits events instead of printing

`runPipeline()` used to print directly (`console.log`, then a hand-rolled
spinner library, `src/spinner.ts`, now deleted). Two consumers needed
fundamentally different views of the same run: an animated Ink dashboard,
and a plain-text log for `--verbose`/CI. Baking presentation into the
pipeline meant every new output mode required either duplicating
`runPipeline()`'s control flow or littering it with `if (verbose) ... else
if (animate) ...` branches at every step.

The fix: `runPipeline()` reports what happened as data
(`PipelineEvent`, `pipeline-events.ts`) and never touches the terminal.
`src/bin/cli.ts` picks exactly one consumer per run (the Ink app, a plain
logger, or a minimal retry-only logger). This also made the pipeline
_more_ testable, not less — `pipeline.test.ts` asserts directly on emitted
events instead of on console output.

## Why cached songs still emit classify events

Before: a song read from cache went straight into the results array with
no event at all. Real consequence: a fully-cached rerun produced _zero_
`classify-*` events, so the live view had nothing to react to and jumped
straight from the header to the final dashboard — the animated experience
the whole live view exists for simply didn't happen for the single most
common case (rerunning something you've already classified).

The fix: every song — cached or not — goes through the same
`classify-queued` → `classify-started` → `classify-completed` sequence.
Only whether a _real_ Jev call happens differs; a cache hit reports
`{ inputTokens: 0, outputTokens: 0, durationMs: 0 }` usage, so it costs
nothing and doesn't inflate the run's token/cost stats, but the UI still
gets a "here's a result" moment to animate. See
[tui.md § the spotlight sequencer](tui.md#the-spotlight-sequencer-read-this-before-touching-it)
for how the reveal pacing adapts so this doesn't take forever for a big
cached discography, or feel instant for a tiny one.

## Why two dashboard implementations

The live Ink view (bordered boxes, live-updating) and the final report
used to be visually unrelated: the live view was Ink, and "done" printed
`render-terminal.ts`'s plain ANSI-string lines via `console.log`, dumped
into a `<Static>` block. Substance was shared (same `VisualizationData`);
style wasn't — a fully-cached run (nothing to animate) jumped straight
from nothing to that old plain-text look, which is what surfaced the
mismatch.

The obvious-looking fix — have Ink render the _string output_ of
`render-terminal.ts` inside a `<Text>` — doesn't work well: Ink measures
and wraps based on visible character width, and a giant pre-formatted
block of ANSI-embedded text fights Ink's own layout engine rather than
using it (no per-panel borders, no consistent chrome, awkward wrapping).
The actual fix was a second, real Ink implementation
(`src/tui/dashboard/`) sharing the underlying _data and color logic_ with
`render-terminal.ts` (see
[architecture.md § the two dashboards](architecture.md#the-two-dashboards))
but not its string-building. More code, but each renderer gets Ink's
layout engine to do the job it's designed for.

## Terminal width can report 0, not just undefined

`process.stdout.columns` (and Ink's `useStdout().stdout.columns`) can be
the literal number `0`, not `undefined`, in some pty contexts before a
real size is known — observed directly in this sandbox (`stty` unset).
Code that guards width with `options.width ?? 80` misses this: `0 ?? 80`
is `0`, not `80`, since `??` only falls through on `null`/`undefined`. The
first time this hit, every spinner label truncated down to a single
character (`Math.max(1, 0 - 1)` = 1). Fix: use `||`, not `??`, for a
"treat 0 as unset" width fallback — deliberately, since a real column
count of `0` is never useful. `src/tui/dashboard/Dashboard.tsx` and the
(now-removed) `src/spinner.ts` both do this.

If you're testing anything width-sensitive in a real terminal, force a
size explicitly rather than trusting whatever the sandbox reports:
`stty rows 45 cols 140` before running the command (see
[tui.md § verifying TUI changes](tui.md#verifying-tui-changes)).

## Why Ink instead of hand-rolled ANSI

The original live-progress UI (`src/spinner.ts`, since deleted) was
hand-rolled: raw ANSI cursor movement, manual "how many lines did I just
draw" bookkeeping, manual erase-and-redraw. It worked, but every one of
its non-trivial bugs was a variant of the same problem: something wrote to
the terminal outside its own bookkeeping (see the next entry) and
corrupted its notion of "what's currently on screen," or its box-drawing
math didn't account for terminal width correctly.

Ink solves both by construction: it recomputes and diffs the _entire_
frame on every render rather than trying to track incremental deltas by
hand, and its flexbox layout (via Yoga) handles wrapping/truncation
consistently. It doesn't make width-math bugs impossible (see
[tui.md § box chrome width](tui.md#the-final-dashboard)), but it collapses
the specific class of "something else corrupted my manual redraw"
failures entirely.

## Why MusicBrainz retries can't use `console.warn`

`musicbrainz.ts`'s 503-retry backoff used to call `console.warn()`
directly. That write happens _outside_ Ink's managed render region — Ink
doesn't know it happened, so its own bookkeeping of "how many lines did I
last draw" goes stale, and its next redraw can corrupt or duplicate
on-screen content. This is the same root problem as the previous entry,
just triggered by our own code instead of a hand-rolled renderer's
internal bug.

Fix: `mbFetch()`/`searchArtist()`/`getDiscography()` take an optional
`onRetry(attempt, maxRetries, delayMs)` callback instead of writing to the
console. `runPipeline()` turns that into a `musicbrainz-retry`
`PipelineEvent`. Each consumer decides what to do with it — the Ink app
shows it in the header, `--verbose` logs it, and even the default quiet
mode gets a minimal listener for just this one event (silently eating up
to ~31s of retries would otherwise look exactly like a hang).
**Never call `console.*` directly from code that might run underneath the
Ink app.** Report it as data through the event stream instead.

## Why classification runs concurrently

Lyrics are fetched and cached before classification starts, so
classifying song N doesn't depend on song N-1 in any way — the original
sequential loop (one Jev call, `await`, next) was leaving real throughput
on the table for no correctness reason. `pipeline.ts` runs up to
`DISCOPRINT_CLASSIFY_CONCURRENCY` (default 5) classify tasks at once via a
manual worker-pool (`Promise.all` over N workers pulling from a shared
index), not because Jev requires it, but because there was nothing
stopping it. `durationMs.classification` is wall-clock time for the whole
phase, not a sum of the individual calls — summing would overstate how
long a concurrent phase actually took (a real bug, fixed and covered by a
regression test asserting concurrent wall time is less than the sum of
the individual call durations).

## Why "Demo" release-groups are excluded

MusicBrainz has pre-fame demo tapes for some artists mis-dated years
before their actual debut — Madonna has one tagged `1980`, three years
before her real 1983 debut album. Since the discography sorts
chronologically and `--limit` takes the first N, an unfiltered demo tape
sorted first and got classified instead of anything with real lyrics
coverage, producing a `--limit N` run that classified zero songs for no
apparent reason. Fixed by adding `"Demo"` to the same
`excludedSecondary` set that already filtered out
`Compilation`/`Live`/`Remix`/`Soundtrack`/`Interview`/`Spokenword` in
`musicbrainz.ts`'s `getReleaseGroups()`.

## Why `main()` strips a stray `"--"` token

Observed specifically with `pnpm run classify -- "Artist Name"`: pnpm
forwards a literal `"--"` through to the underlying script when that
script is `tsx <file>`, but strips it for a plain `node -e` script. The
result was `"Artist Name"` silently becoming `"-- Artist Name"` — a
`MusicBrainz` "not found" error with no indication why. Rather than
depending on understanding pnpm/tsx's exact internal forwarding behavior
(which could change), `main()` in `cli.ts` filters any literal `"--"`
out of `process.argv.slice(2)` unconditionally, so the CLI behaves the
same regardless of what invoked it.
