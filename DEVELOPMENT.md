# Development

See [README.md](./README.md#local-development-setup) for cloning, installing
dependencies, and setting up `TYPESAFE_API_KEY`.

## Running from source

No build step needed — these run `src/bin/cli.ts` directly via `tsx`:

```bash
pnpm run classify -- "Radiohead" --limit 10   # alias for: tsx src/bin/cli.ts
pnpm run visualize -- "Bon Jovi"              # alias for: tsx src/bin/cli.ts visualize
```

## Running as the actual `discoprint` command

To try it exactly as an end user eventually would via `npx discoprint`, build
it and link it globally:

```bash
pnpm run build      # compiles to dist/ via tsdown
pnpm link --global  # symlinks the built dist/bin/cli.cjs as `discoprint` on your PATH

discoprint "Bon Jovi"
discoprint visualize "Bon Jovi"
```

`pnpm link --global` points at whatever is currently in `dist/`, so re-run
`pnpm run build` after making changes to pick them up.

Unlink when you're done:

```bash
pnpm unlink --global discoprint
```
