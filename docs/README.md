# Project docs

Deep-dive documentation for anyone (human or agent) working on
discoprint's internals. `README.md` at the repo root covers user-facing
behavior; `CONTRIBUTING.md`/`RELEASE.md`/`DEVELOPMENT.md` cover the generic
process. These cover _this specific codebase_: how it's built, why it's
built that way, and what's already been tried and found not to work.

- **[architecture.md](architecture.md)** — the three layers (pipeline →
  events → renderers), the two dashboard implementations and what they
  share, where things live.
- **[tui.md](tui.md)** — the Ink live view and final dashboard: event
  flow, the spotlight sequencer's timing (read before touching it), the
  box-chrome-width gotcha, how to verify a TUI change.
- **[jev-integration.md](jev-integration.md)** — how this project uses
  `@typesafe-ai/sdk` specifically: cost tracking, model resolution, error
  mapping, concurrency. For a domain-agnostic Jev guide (useful for a
  _different_ project), see `~/the-yard/jev-intro.md`.
- **[caching.md](caching.md)** — exact cache file layout and invalidation
  rules, including the ones that surprise people (lyrics never
  auto-invalidate, `-meta.json` is a per-run snapshot not a running total).
- **[testing.md](testing.md)** — conventions specific to this codebase:
  mock at the fetch boundary, env vars read at module load time, and the
  real gap (Ink components have no unit tests — verify with a real pty run).
- **[decisions.md](decisions.md)** — why things are built the way they
  are, with the specific bug or incident that drove each decision. Read
  before "simplifying" something that looks over-engineered at first
  glance — most of it isn't.

Keep this index current: when you add a new doc here, link it from this
file (per `AGENTS.md`'s own instruction).
