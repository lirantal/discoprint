# Jev / TypeSafe AI integration

This project's specific use of `@typesafe-ai/sdk`. For a domain-agnostic
guide to Jev itself (useful if you're starting a _different_ project with
it), see `~/the-yard/jev-intro.md` — this file is the "how and why we used
it here" counterpart, not a general reference.

## The one call this whole app is built around

`src/jev.ts`'s `classifySong()` makes exactly one `systemOne` call per
song, batching all 5 questions (`theme`, `mood`, `complexity`, `explicit`,
`firstPerson`) into that single call via `questionsFor()`. This is not
five calls that happen to run together — it's one HTTP request with five
typed questions, evaluated by Jev in parallel with minimal added latency
over asking just one. See the [Classifiers table in
README.md](../README.md#classifiers) for what each question actually asks
and its rubric; this file is the _why_/_how_, not the _what_.

**Don't split this into per-question calls.** There's no benefit (Jev
already parallelizes internally) and a real cost (5x the HTTP round trips,
5x the base per-request overhead).

## Cost tracking is entirely client-side

The API response (`SystemOneResult`) has no cost field — only
`usage: { input_tokens, output_tokens }`. `estimateCostUsd()` in `jev.ts`
multiplies input tokens by a hardcoded price
(`INPUT_TOKEN_PRICE_PER_MILLION_USD = 0.042`, sourced from
`docs.typesafe.ai/models.md`, confirmed as of jev-1.13.0 — **output tokens
are free**, not just cheap). This constant is specific to jev-1.13.0's
pricing and will need updating if TypeSafe changes it or you pin a
different model version. There's no API to query current pricing at
runtime; if that ever becomes available, prefer it over a hardcoded
constant.

## Model resolution and why `lastModel` matters

Requests here never pass an explicit `model` — the client's
`defaultModel` (from `TYPESAFE_DEFAULT_MODEL`, or the SDK's own default of
`jev-latest`) is used. `jev-latest`/`jev-preview` are aliases that can
silently resolve to a different concrete version over time (`jev-1.13.0`
today) — the _response_ tells you which one actually answered
(`response.model`), and that's what gets recorded as `ClassificationRunMeta.model`
and shown in the dashboard's usage footer, specifically so a change in
what alias resolves to is visible after the fact rather than silently
invisible. `pipeline.ts` only updates `lastModel` on a genuine Jev call —
a cache hit doesn't touch it, since a cache hit didn't ask any model
anything this run (see
[decisions.md § cached songs still emit events](decisions.md#why-cached-songs-still-emit-classify-events)
for the related event-emission behavior).

## Score answers are fractional, not just the rubric index

`mood`/`complexity` are `Score` questions with a 5-level and 4-level
rubric respectively (indices 0–4 and 0–3). The returned `score` is a
**probability-weighted expected value across the whole rubric**, not
necessarily one of the integer levels — a song can score `2.3` or `3.64`.
This surprised us mid-project (moods appeared as fractional numbers, not
clean integers) and is why every place that displays a mood/complexity
value formats it with `.toFixed(1)` or similar rather than assuming an
integer. If you add a new `Score` question, expect the same and format
accordingly.

## Error handling

`src/errors.ts`'s `describeError()` maps the SDK's error hierarchy
(`AuthenticationError`, `RateLimitError`, `PermissionDeniedError`,
`APIConnectionError`, `APIError`, `TypeSafeError`) to a human-readable
message with an actionable next step (check `TYPESAFE_API_KEY`, retry with
`--limit` to reduce load, etc.), separately from `KnownError` (this
project's own "this failure is predictable, don't show a stack trace"
marker for non-SDK failures like a bad artist name). Anything not on that
list still prints its full stack trace — deliberately, so a genuinely
unanticipated failure stays debuggable instead of being silently flattened
into a generic message.

Retries for `429`/`529` are handled by the SDK itself
(`TypeSafeClient`'s built-in `RetryPolicy`, not anything in this
codebase) — there's no custom retry wrapper around `classifySong()`. This
is unlike `musicbrainz.ts`, which does implement its own retry/backoff,
because MusicBrainz's 503 semantics are specific to that API (503
specifically means "rate limited," not a generic server error) and aren't
something a generic SDK retry policy would know to special-case.

## Concurrency

Nothing about the Jev API requires classifying one song at a time — each
`classifySong()` call is an independent HTTP request. `pipeline.ts` runs up
to `DISCOPRINT_CLASSIFY_CONCURRENCY` (default 5) at once via a manual
worker pool. See
[decisions.md § why classification runs concurrently](decisions.md#why-classification-runs-concurrently)
for the reasoning and the wall-clock-vs-sum duration-tracking bug this
surfaced.
