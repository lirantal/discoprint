# AGENTS.md

Guidance for AI coding agents working in this repository.

## Start Here

Before making changes, read:

- `CONTRIBUTING.md` for contribution, PR, testing, commit, and agent-specific expectations.
- `RELEASE.md` for release workflow details.
- `README.md` for user-facing behavior, install/use examples, and package or app overview.
- `DEVELOPMENT.md` for local setup and development workflows.
- **`docs/README.md`** for how this specific codebase is built and why —
  architecture, the Ink TUI's sharper edges, the Jev integration, caching
  semantics, testing conventions, and a decisions log explaining what's
  already been tried and found not to work. Read this before changing
  anything under `src/pipeline.ts`, `src/tui/`, or `src/jev.ts` — several
  things that look like reasonable simplifications there have already
  caused a real, previously-fixed bug once.

Treat those files as the source of truth. Do not duplicate or reinterpret their rules here.

## Documentation

- Keep documentation in sync when changing behavior, public interfaces, workflows, architecture, configuration, or operational assumptions.
- Put project-specific development details in `docs/`; keep root files focused on their standard audiences.
- Prefer linking to the source of truth over duplicating long instructions across files.
- When adding new docs, link them from `docs/README.md` and update this file only when they become important entry points for future agents.

## PRs and Issues

- Follow PR, issue, and agent-labeling rules in `CONTRIBUTING.md`.
- Use the issue-linking format specified in `CONTRIBUTING.md`.

## Releases

- Follow `RELEASE.md` for release workflow and changeset creation steps.
- If this project uses changesets, treat `RELEASE.md` and any changeset guidance in `CONTRIBUTING.md` as authoritative.
