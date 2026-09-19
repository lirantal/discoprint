# artist-lyrics-classifier

Classify an artist's entire discography by theme, mood, lyrical complexity and a
couple of content flags — using [Jev](https://docs.typesafe.ai/introduction)
(TypeSafe's structured-decision model) instead of an LLM you'd have to parse.

## How it works

1. **[MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API)** — free, keyless — resolves the artist name
   to an ID and pulls their full album/EP discography with release dates.
2. **[lrclib.net](https://lrclib.net/docs)** — free, keyless, community lyrics database — fetches plain lyrics
   per track. Tracks with no match are skipped (recorded in `*-skipped.json`).
3. **Jev** classifies each song against 5 atomic questions in a single batched call:
   - `theme` (Choice): love / heartbreak / party_fun / money_success / social_political / loss_grief / self_reflection / other
   - `mood` (Score 0–4): dark/sad → joyful/triumphant
   - `complexity` (Score 0–3): simple/repetitive → rich in metaphor and imagery
   - `explicit` (Noul): contains profanity/explicit content
   - `firstPerson` (Noul): personal, first-person narrative

Every stage is cached to disk under `data/cache/`, so re-runs are incremental and
you can safely interrupt a long run (MusicBrainz is rate-limited to 1 req/sec, so
a big discography takes a few minutes just for step 1).

## Setup

```bash
npm install
cp .env.example .env
# put your key from https://console.typesafe.ai/keys into .env
```

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

## Notes / limitations

- lrclib is community-sourced; some tracks (especially deep cuts or non-English
  releases) won't have lyrics.
- Title deduping across reissues/remasters/deluxe editions is a heuristic
  (see `normalizeTrackTitle` in [src/util.ts](src/util.ts)) — spot-check the
  discography cache if you need exact coverage for an artist with many reissues.
- Costs scale with API pricing per `systemOne` call; each track is one call
  batching all 5 questions (much cheaper than 5 separate calls — see TypeSafe's
  [parallel questions cookbook](https://docs.typesafe.ai/cookbooks/parallel_questions)).
