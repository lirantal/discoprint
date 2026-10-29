import { defineConfig } from "tsdown";

const shared = {
  outDir: "dist/",
  sourcemap: false,
  treeshake: false,
  target: "es2022" as const,
  platform: "node" as const,
  tsconfig: "./tsconfig.json",
  fixedExtension: true,
  minify: false,
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/main.ts"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    cjsDefault: true,
  },
  {
    ...shared,
    // ESM only: this is a `bin` script Node runs directly, never `require()`'d
    // by a consumer, and its dependency graph (ink) is ESM-only with
    // top-level await — a CJS build of it fails at runtime with
    // ERR_REQUIRE_ASYNC_MODULE when `require()`'d, which is exactly how
    // `bin` entries get invoked if they end in `.cjs`.
    entry: ["src/bin/cli.ts"],
    // As the sole entry, tsdown flattens it to dist/cli.mjs unless outDir
    // is pinned back to dist/bin/ to match the package.json `bin` path.
    outDir: "dist/bin/",
    format: ["esm"],
    dts: false,
    clean: false,
  },
]);
