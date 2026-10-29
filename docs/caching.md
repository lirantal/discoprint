# Caching

The user-facing behavior (what's cached, what `--force` does) is documented
in [README.md § Caching](../README.md#caching) — read that first if you
haven't. This is the implementation-level detail: exact paths, exact
invalidation rules, and the traps.

## Layout

`<data dir>` is resolved by `resolveDataDir()` in `src/paths.ts`: an explicit
`dataDir`/`--data-dir` override, else `DISCOPRINT_DATA_DIR`, else
`$XDG_CONFIG_HOME/discoprint` (falling back to `~/.config/discoprint`). It's
resolved fresh inside `runPipelineInner()` on every call — nothing pins it at
module load time.

```text
<data dir>/cache/musicbrainz/<artist-slug>.json                full discography (Track[])
<data dir>/cache/lyrics/<artist-slug>/<track-slug>.json          one LyricsResult per track
<data dir>/cache/classification/<artist-slug>/<track-slug>.json  one SongClassification per track
<data dir>/output/<artist-slug>.json                             SongClassification[] — the final result
<data dir>/output/<artist-slug>-skipped.json                     { track, reason }[] — no lyrics found
<data dir>/output/<artist-slug>-meta.json                        ClassificationRunMeta — last run's stats
```

`<artist-slug>` and `<track-slug>` both come from `slugify()` in
`util.ts` — `<artist-slug>` from the _resolved_ artist name (post
MusicBrainz lookup, not whatever the user typed), `<track-slug>` from
`normalizeTrackTitle()`'s output (strips remaster/live/deluxe noise so
reissues of the same song share a cache entry — see its own tests in
`util.test.ts` for exactly what it strips).

`readJsonCache()`/`writeJsonCache()` (`util.ts`) are the only functions
that touch these paths directly; they return `null` on any read failure
(missing file, invalid JSON) rather than throwing, which is what makes
"treat a cache miss as need-to-fetch" a one-line check everywhere it's
used (`if (!cached) { ...fetch... }`).

## Invalidation rules, precisely

| Cache          | Invalidated by                                   | Not invalidated by                                           |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| Discography    | `--force`                                        | `--limit` (only slices the already-fetched full list)        |
| Lyrics         | **Nothing automatic.** Delete the file yourself. | `--force` — lyrics don't change, so force doesn't touch them |
| Classification | `--force`                                        | A changed Jev question/rubric in `jev.ts` — see below        |

**Changing a classifier's question or rubric in `jev.ts` does not
invalidate any cached classification.** Cached results are just JSON on
disk with no version stamp tying them to the exact question that produced
them — if you change what `mood` asks, every previously-cached song still
has its _old_ answer until re-classified with `--force`, and there's no
automated way to tell which cache entries are stale. If you change a
classifier's wording/rubric in a way that would meaningfully change
answers, say so in the PR description and consider whether existing users'
`<data dir>/cache/classification/` needs a `--force` rerun to stay meaningful.

Artist resolution is **never** cached — `searchArtist()` is a live
MusicBrainz call on every single run, unconditionally, regardless of
`--force`. This is why even a fully-cached rerun still makes exactly one
network call (see
[jev-integration.md](jev-integration.md) for how a _fully_-cached run
still produces a live-view animation despite this one real call and zero
Jev calls).

## `-meta.json` reflects the run, not the artist

`ClassificationRunMeta` (the `-meta.json` file) is **overwritten on every
run**, and reflects only what _that specific invocation_ did —
`songsClassifiedThisRun`, `tokens`, `estimatedCostUsd`, and
`durationMs.classification` are all `0` (or `null` for `model`) if
everything came from cache, even though `totalSongsInOutput` correctly
still reflects the artist's full classified discography. Don't read this
file expecting a running lifetime total across all runs ever done for an
artist — it's explicitly a snapshot of the most recent invocation only.
This is why `discoprint visualize` (which never calls `runPipeline` at
all) still shows a `jev usage` footer: it reads whatever `-meta.json` was
last written by an actual classify run, which could be from a much
earlier invocation.

## The output file is a flat rewrite, not an append

`<data dir>/output/<artist-slug>.json` is fully rewritten from the in-memory
`results` array on every run — it is not incrementally appended to. This
is safe because `runPipeline()` always processes the _entire_ requested
scope (`options.limit ? tracks.slice(0, limit) : tracks`) each time,
reading each individual song's classification from
`<data dir>/cache/classification/` (a hit) or generating it fresh (a miss) —
the union of cache hits and fresh classifications for the current scope is
always the complete, correct output, so a flat rewrite is correct and
there's no need for incremental merge logic. If you ever change
`runPipeline()` to process a _partial_ scope relative to some other
run, this invariant breaks and the flat-rewrite approach would need
reconsidering.
