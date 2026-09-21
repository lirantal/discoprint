# The Ink TUI

`src/tui/` is the live classify view and the dashboard it settles into.
This is the newest, most structurally involved part of the codebase, and
the part where nearly every non-obvious bug in this project's history has
lived — read this before touching it, especially before touching
`useSpotlightSequencer.ts` or anything with a `useEffect`.

## The pieces

```text
src/tui/state.ts                 pure (AppState, PipelineEvent) -> AppState
                                  reducer. No Ink/React import — unit tested
                                  directly (state.test.ts).
src/tui/App.tsx                  top-level component: owns the reducer,
                                  decides live-view vs. final-dashboard,
                                  drives the transition between them.
src/tui/Header.tsx                live-view status bar (phase, spinner,
                                  elapsed time, retry notice).
src/tui/SongLog.tsx                live-view left panel: scrolling log of
                                  completed songs (capped, "N earlier").
src/tui/SpotlightPanel.tsx         live-view right panel: the currently
                                  spotlighted song's bars + in-flight list.
src/tui/useSpotlightSequencer.ts   the reveal-animation pacing logic. See
                                  below — this file has the sharpest edges.
src/tui/Legend.tsx, StatsFooter.tsx  live-view chrome (unboxed, like Header).
src/tui/hooks.ts                   useSpinnerFrame, useElapsedMs.
src/tui/runClassifyUI.ts           glue: mounts <App>, wires runPipeline's
                                  onEvent to it via a buffered pub-sub.
src/tui/dashboard/                 the final, settled dashboard (see below).
```

## Event flow

`runClassifyUI()` doesn't pass Ink into `pipeline.ts` — it creates a small
pub-sub (`history` array + `listeners` Set), passes `onEvent: (e) => {
history.push(e); for (const l of listeners) l(e); }` to `runPipeline()`,
and gives `<App>` a `subscribe()` function that replays `history` before
adding a new listener. This exists because of a real race: `runPipeline()`
starts emitting **before** React's first `useEffect` flush completes (its
first event, `artist-resolving`, fires synchronously with no `await`
before it). Without the replay, that first event — and possibly more —
would be silently lost. If you ever see the live view start on
`fetching-discography` instead of `resolving-artist`, this is the first
place to suspect.

`state.ts`'s `reduce()` is a plain reducer over `PipelineEvent`. It has no
Ink or React import, which is deliberate — it's tested directly in
`state.test.ts` with zero rendering involved. **When you add a new
`PipelineEvent` variant, you almost always need to touch four places**:
`pipeline-events.ts` (the type), `pipeline.ts` (emit it), `state.ts` (a
`case` in the reducer), and whatever component displays it (`Header.tsx`
for phase-level events, `SpotlightPanel.tsx`/`SongLog.tsx` for per-song
ones). Forgetting the reducer case is silent — the event just does
nothing, no error, no test failure, because nothing asserts "every event
type has a case."

## The spotlight sequencer: read this before touching it

`useSpotlightSequencer(log, totalToClassify)` walks `log` one entry at a
time, animating each into view before advancing. Its job is genuinely
tricky for three compounding reasons, and the current implementation is
the result of three separate bugs found by _actually running the app in a
real terminal_ — none of them were caught by typecheck, lint, or a unit
test:

1. **Effects must key on the derived value, not the index driving it.**
   The first version keyed its reveal effect on `[cursor]`. On mount,
   `cursor` is `0` and `log` is empty, so the effect runs once, sees no
   song, and returns. When the first song later arrives, `cursor` is
   _still_ `0` — so the effect's dependency hasn't changed, and it never
   re-fires to notice a song showed up. The fix: key the effect on the
   `song` object itself (`log[cursor]`), which genuinely changes identity
   on that transition (array elements before the append point keep their
   reference across `[...log, x]` copies, so this is stable while later
   items append behind the current one, but correctly fires when
   `log[cursor]` changes).

2. **Every scheduled timer needs to be cancelled on cleanup, not just the
   interval.** The reveal runs as a `setInterval` that clears itself and
   schedules a `setTimeout` to advance the cursor after a pause. That
   `setTimeout` is a _second_ timer, separate from the interval — if the
   effect re-runs (because `song` changed for some other reason) before
   that timeout fires, the stale timeout can still fire later and advance
   `cursor` an extra, unwanted time. Track it in a local variable and
   `clearTimeout` it in the cleanup function alongside `clearInterval`.

3. **Pacing is adaptive, not fixed, and the "when do we move on" question
   is answered by the sequencer catching up, not by a timer in `App.tsx`.**
   Early versions used a fixed `setTimeout` in `App.tsx` before loading the
   final dashboard. That's wrong for two different reasons depending on
   direction: too short, and a big batch gets cut off mid-reveal on some
   earlier song instead of ending on the true last one; too long, and a
   small batch (or a fully-cached run — see
   [decisions.md § animate cached runs too](decisions.md#why-cached-songs-still-emit-classify-events))
   waits around for nothing. The fix: `useSpotlightSequencer` computes a
   per-item pace from a **total time budget** (`SPOTLIGHT_TOTAL_BUDGET_MS`,
   default 4s) divided by `totalToClassify`, clamped to a sane
   min/max-per-item range, and returns a `caughtUp: cursor >= log.length`
   flag. `App.tsx` waits for `state.phase === "done" && caughtUp` before
   loading the dashboard — no fixed timer at all.

If you're adding a new field to the spotlight or changing its timing,
re-verify all three of these are still true. Unit tests exist for the
_data_ math (`bars.test.ts`) but not for this hook's timing — see
[testing.md](testing.md#ink-components-have-no-unit-tests) for why, and
verify via a real pty run (below) instead.

## `useElapsedMs`: "stop ticking" isn't "freeze the value"

A related bug, same root cause as #3 above: `Header.tsx`'s elapsed-time
display kept counting up _after_ the run finished, because the live view
stays mounted (and re-rendering, driven by the spotlight's own animation)
for the duration of the spotlight's post-"done" playthrough. `useElapsedMs`
originally just stopped _scheduling new ticks_ once `active` went false —
but its return value was always `Date.now() - startedAt`, recomputed on
_every_ render regardless of what triggered it. Something else in the tree
re-rendering (the spotlight) kept producing a fresh, larger number even
though this hook's own timer had stopped. Fixed by capturing a frozen
value in a ref the first time `active` is false, and returning that
instead of a fresh computation. If you write a hook that's supposed to
"stop" once some condition flips, ask specifically: does the _value it
returns_ stop, or does only the thing that _used to update it_ stop? Those
are different bugs.

## The final dashboard

`src/tui/dashboard/` is a from-scratch Ink re-implementation of
`render-terminal.ts`'s dashboard, not a wrapper around its string output
(see [decisions.md](decisions.md#why-two-dashboard-implementations)).
`App.tsx` swaps from the live view to this once
`state.phase === "done" && caughtUp`, after loading the same
`VisualizationData` `discoprint visualize` reads.

It's committed via Ink's `<Static>` component, not returned as a normal
render. This matters: Ink erases its _normal_ dynamic output when the app
unmounts (that's what makes the live view's boxes disappear cleanly
instead of leaving cursor-position garbage behind). `<Static>` content is
the opposite — written once, permanently, and guaranteed never to be
re-rendered or erased. Anything meant to survive in the user's scrollback
after the process exits has to go through `<Static>`; anything transient
(the live view itself) must not, or it would never get cleaned up.

**Box chrome width is a real, easy-to-repeat bug.** `SongsPanel.tsx` and
`OverviewPanel.tsx` both wrap content in `<Box borderStyle="round"
paddingX={1}>`. That border + padding consumes exactly 4 columns (1 border

- 1 padding on each side) that are _not_ available to the content inside.
  Both panels compute `contentWidth = width - BOX_CHROME_WIDTH` (with
  `BOX_CHROME_WIDTH = 4`) before doing any title-truncation or bar-width
  math using the box's own `width` prop. The bug this fixes: pass the full
  box `width` straight into a row's width calculation, and every row
  overflows by exactly 4 characters and wraps onto a second line — found
  only by running the app in a real terminal, not by any test. **If you add
  a new bordered panel, budget for its chrome the same way.**

## Verifying TUI changes

There is no `ink-testing-library` in this project (a deliberate scope cut —
see [testing.md](testing.md#ink-components-have-no-unit-tests)). Every bug
listed above was found by actually running the app in a pty, not by
typecheck/lint/tests. To do the same:

```bash
# Force a real pty and a wide-enough terminal (this sandbox reports 0x0
# columns/rows without it, which triggers its own bugs — see
# docs/decisions.md "Terminal width can report 0, not just undefined")
script -qec 'stty rows 45 cols 140; pnpm run classify -- "Some Artist" --limit 8 --force' /tmp/run.log
cat /tmp/run.log | tr -d '\r' | sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g'
```

`--force` (or deleting `<data dir>/cache/classification/<slug>/`) forces real
classify events instead of an instant fully-cached run, if you specifically
need to see the concurrency/in-flight behavior rather than the
cached-replay path.

## Adding a new PipelineEvent

1. Add the variant to the `PipelineEvent` union in `pipeline-events.ts`.
2. `emit({ type: "...", ... })` at the right point in `pipeline.ts`
   (`runPipelineInner`, or the top-level `runPipeline` catch block for
   run-wide failures).
3. Add a `case` in `state.ts`'s `reduce()` — even if it's a no-op, add it
   explicitly (see `case "lyrics-ready": return state;`) so it's obvious
   the event was considered, not missed.
4. Update whichever component should display it, and `createPlainLogger()`
   in `cli.ts` if `--verbose` should say something about it too.
5. Add a test asserting `runPipeline` emits it (`pipeline.test.ts`, mock
   `globalThis.fetch`, assert on the `onEvent` callback's calls) and a
   `state.test.ts` case for the reducer transition.
