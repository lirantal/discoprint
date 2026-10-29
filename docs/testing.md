# Testing conventions

`CONTRIBUTING.md` covers the generic rules (tests required for behavior
changes, must pass locally and in CI, coverage shouldn't regress). This
covers what's specific to _this_ codebase's approach.

## No test framework, only `node:test`

There is no Jest/Vitest/Mocha dependency, deliberately — the built-in
[`node:test`](https://nodejs.org/api/test.html) runner plus
`node:assert/strict` is enough for everything this project needs, and it's
one less dependency to keep current. Run via `tsx` (`pnpm test` ==
`tsx --test`) because source uses `.js`-suffixed imports pointing at `.ts`
files (the NodeNext/TypeScript convention this project follows), and `tsx`
handles that transparently. Don't add a test framework dependency to solve
a problem — check whether `node:test` already has what you need (it has
`t.mock.method`, `t.test()` for nested subtests, `t.after()` for cleanup,
etc.).

## Mock at the network boundary, nothing deeper

Every test that exercises a network-touching function
(`musicbrainz.ts`, `lrclib.ts`, `jev.ts`) mocks `globalThis.fetch` with
`t.mock.method`, not the SDK or a higher-level wrapper. For
`@typesafe-ai/sdk` specifically, this means constructing the exact JSON
shape `POST /v1/systemone` returns (see `mockJevClassification()` in
`pipeline.test.ts` for the canonical example) rather than mocking
`TypeSafeClient` itself. This keeps tests honest about the actual wire
contract and means a real SDK upgrade that changes internals (but not the
wire format) doesn't require touching any test.

## Environment variables are set before the module is imported

Several modules read tunable values (rate-limit intervals, retry counts,
retry base delays, animation timing) from `process.env` **at module load
time**, not per-call — e.g. `musicbrainz.ts`'s `MIN_INTERVAL_MS`,
`MAX_RETRIES`, `RETRY_BASE_MS`. Tests that need a fast/deterministic value
must set the env var _before_ importing the module, which in an ESM test
file means a dynamic `await import(...)` after the `process.env.X = ...`
assignment, not a static top-level `import`:

```ts
process.env.MUSICBRAINZ_MIN_INTERVAL_MS = "0";
process.env.MUSICBRAINZ_RETRY_BASE_MS = "0";
const { searchArtist } = await import("./musicbrainz.js");
```

`musicbrainz-retry-limit.test.ts` is its own file specifically so it can
set a _different_ `MUSICBRAINZ_MAX_RETRIES` than `musicbrainz.test.ts`
without two module instances (each with different env-derived constants)
coexisting in the same process — Node's coverage instrumentation attributes
both to the same file and gets confused if they disagree. If you need a
different tunable value for one test than the rest of a file uses, a
separate file is the established pattern here, not a runtime override
mechanism.

## Ink components have no unit tests

There's no `ink-testing-library` in this project — a deliberate scope
decision, not an oversight. `src/tui/`'s pure logic (the reducer in
`state.ts`, the bar/glyph math in `dashboard/bars.ts`) _is_ unit tested,
with zero Ink/React involved, by design (see
[architecture.md](architecture.md) and [tui.md](tui.md) for how that split
works). What's **not** covered by any automated test: Ink's actual
rendered output — box widths, wrapping, whether an effect's timing
actually produces the right visual sequence.

Every bug found in `src/tui/` so far (the spotlight reveal never starting,
a stale timer pushing a cursor out of bounds, box-chrome width miscounts,
`useElapsedMs` not freezing) was found by running the app in a real pty
and reading the output, not by any test — see
[tui.md § verifying TUI changes](tui.md#verifying-tui-changes) for the
exact command. **If you change anything under `src/tui/`, verify it with a
real pty run before considering it done**, regardless of what
typecheck/lint/existing-tests say. They will not catch a layout or timing
regression here.

If this becomes painful enough to be worth a dependency, `ink-testing-library`
(maintained by Ink's own author) is the natural fit — it wasn't added yet
purely because of the scope of the work already in flight when the gap was
identified, not because it's a bad idea.

## Coverage exclusions

`pnpm run test:coverage` excludes `src/**/*.test.ts`, `src/bin/cli.ts`, and
`src/main.ts` — the CLI shell and the library re-export surface are thin
enough that mocking `process.exit`/argv just to hit them isn't worth it.
Everything else is expected to be covered.

## What's tested where

- `src/util.test.ts` — pure functions, disk-cache round trip.
- `src/musicbrainz.test.ts`, `musicbrainz-retry-limit.test.ts` — artist
  resolution, release-group filtering (including the `Demo` exclusion
  regression test), retry/backoff behavior and exhaustion, dedup across
  reissues.
- `src/lrclib.test.ts` — the `/get` → `/search` fallback chain.
- `src/jev.test.ts` — the exact request sent to `systemOne` (state shape,
  all 5 questions batched in one call), response mapping, `estimateCostUsd`.
- `src/errors.test.ts` — every mapped error case in `describeError`.
- `src/pipeline.test.ts` — full integration runs against a temp directory:
  fresh run, cached rerun, `--force`, `--limit`, the full `onEvent` stream
  (order, optionality, a mid-run failure, cached songs still emitting
  events with zero usage), and that concurrent classification is actually
  concurrent (wall time less than the sum of the individual calls).
- `src/prompt.test.ts` — TTY/CI detection, validation retries, cancellation.
- `src/tui/state.test.ts` — the reducer, one test per `PipelineEvent` variant.
- `src/tui/dashboard/bars.test.ts` — bar/glyph/sparkline math as plain
  functions returning `{ char, color }` data.
- `src/format.test.ts` — shared number formatting.
- `src/viz/*.test.ts` — data shaping/aggregation and the plain-text
  dashboard's adaptive layout, column alignment, and edge cases.
