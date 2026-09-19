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

| Field | Primitive | Question | Options / rubric |
|---|---|---|---|
| `theme` | [Choice](https://docs.typesafe.ai/primitives/choice) | What is the primary theme of these song lyrics? | `love` — romantic love, desire, or devotion · `heartbreak` — breakup, longing, or lost love · `party_fun` — partying, dancing, or having a good time · `money_success` — wealth, fame, ambition, or success · `social_political` — social commentary, injustice, or politics · `loss_grief` — death, mourning, or grief · `self_reflection` — introspection, identity, or personal growth · `other` — doesn't clearly fit the above |
| `mood` | [Score](https://docs.typesafe.ai/primitives/score) 0–4 | How positive or upbeat is the emotional tone of these lyrics? | 0 very dark/sad/despairing · 1 melancholic/downbeat · 2 neutral/mixed · 3 positive/hopeful · 4 joyful/euphoric/triumphant |
| `complexity` | [Score](https://docs.typesafe.ai/primitives/score) 0–3 | How lyrically dense or literary is the language in these lyrics? | 0 very simple/repetitive · 1 straightforward/plain · 2 some figurative language or wordplay · 3 rich in metaphor, imagery, or literary technique |
| `explicit` | [Noul](https://docs.typesafe.ai/primitives/noul) 0–1 | These lyrics contain profanity or explicit sexual content. | probability of yes |
| `firstPerson` | [Noul](https://docs.typesafe.ai/primitives/noul) 0–1 | These lyrics are narrated from a personal, first-person perspective about the singer's own experience. | probability of yes |

`Choice` and `Score` answers also come back with a `confidence` (0–1), which is
recorded alongside each value as `themeConfidence`, `moodConfidence` and
`complexityConfidence`. The full row shape per song lives in
[src/types.ts](src/types.ts) (`SongClassification`) and is what lands in
`data/output/<artist-slug>.json`.

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
# smoke test on a handful of tracks first
npm run classify -- "Radiohead" --limit 10

# full discography
npm run classify -- "Radiohead"

# include singles/live albums/compilations too (default: albums + EPs only)
npm run classify -- "Radiohead" --include-non-albums

# re-classify ignoring cached results
npm run classify -- "Radiohead" --force
```

Output lands in `data/output/<artist-slug>.json` — one row per track with all
five classifications, ready to chart (e.g. mood/complexity over time, theme
distribution per album).

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
- [src/pipeline.test.ts](src/pipeline.test.ts) — full integration run against a temp directory: fresh run, cached rerun (only artist resolution hits the network), `--force`, `--limit`

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
