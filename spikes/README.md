# Spikes

Throwaway prototypes for evaluating an approach before committing to it.
Nothing in here is wired into the real CLI (`src/`), isn't type-checked or
linted as part of `pnpm run typecheck`/`lint` (see the ignore entries in
`tsconfig.json`/`eslint.config.js`), and isn't part of the published package.

## `ink-classify-demo.tsx`

```bash
pnpm run spike:ink
```

Evaluates whether an [Ink](https://github.com/vadimdemedes/ink)-based
two-panel "live classifying" layout reads better than the current
single-column terminal checklist (`src/spinner.ts` +
`src/viz/render-terminal.ts`). Inspired by a Snake-playing-AI demo shared for
reference: one panel logs each completed decision (here: each classified
song), a second panel shows the *current* item's stats animating in live,
and a footer tracks running aggregates.

All data is simulated — fixed fake songs, fake token counts, no network
calls, no Jev/MusicBrainz/lrclib involved. It only exists to answer "does
this layout feel better," not "does this work end to end." Press `q` to
quit early.

If the answer is yes, the real integration means:

- Moving `ink`/`react` from devDependencies to dependencies.
- Replacing `src/spinner.ts`'s hand-rolled ANSI cursor control with Ink
  components (it already solves the layout/diffing bugs we hit hand-rolling
  this: the `columns: 0` truncation bug and the checklist-residue
  duplication bug — see git log).
- `runPipeline` (`src/pipeline.ts`) would need to feed real per-song
  progress into React state instead of calling spinner/task-list methods
  imperatively — likely via a small event emitter or callback passed into
  the classify phase.
- `src/viz/render-terminal.ts`'s pure `VisualizationData -> string[]`
  design can stay as-is for the final static dashboard; Ink would only
  replace the *live, in-progress* rendering during classification.
