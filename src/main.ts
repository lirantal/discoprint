// Programmatic surface, for consumers who want to run the pipeline or render
// a dashboard themselves rather than going through the CLI (see src/bin/cli.ts).
export { runPipeline, type RunOptions } from "./pipeline.js";
export { loadVisualizationData, buildVisualizationData, type VisualizationData, type AlbumGroup } from "./viz/data.js";
export { renderTerminal, type TerminalRenderOptions } from "./viz/render-terminal.js";
export type { SongClassification } from "./types.js";
