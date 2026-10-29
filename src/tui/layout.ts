// The one place the live view and the settled dashboard agree on how wide
// things are. Both render a main column on the left and a fixed-width panel
// on the right (SongLog + SpotlightPanel while classifying; OverviewPanel +
// AveragesPanel once done), and they must resolve to the *same* geometry —
// otherwise the right-hand panel jumps sideways and resizes at the exact
// moment the live view settles, which is the one frame the user is watching.
import { useStdout } from "ink";

const MAX_WIDTH = 120;
const MIN_WIDTH = 40;
const DEFAULT_WIDTH = 80;

/** Fixed width of the right-hand panel, in both views. */
export const SIDE_PANEL_WIDTH = 44;
/** The `marginRight` between the two columns. */
export const COLUMN_GAP = 1;
/** 1 char of border + 1 char of paddingX on each side — not available to a bordered panel's content. */
export const BOX_CHROME_WIDTH = 4;

// Below this, the two columns would squeeze the main one down to nothing, so
// they stack instead. SIDE_PANEL_WIDTH twice over leaves the main column at
// least as wide as the side panel before we commit to a row.
const MIN_TWO_COLUMN_WIDTH = SIDE_PANEL_WIDTH * 2 + COLUMN_GAP;

/**
 * Terminal columns, clamped to something renderable. `||` rather than `??`
 * on purpose: some ptys report a literal `0` before a real size is known,
 * and `0 ?? 80` is `0` (see docs/decisions.md "Terminal width can report 0").
 */
export function clampWidth(columns: number | undefined): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, columns || DEFAULT_WIDTH));
}

export function useTerminalWidth(): number {
  const { stdout } = useStdout();
  return clampWidth(stdout?.columns);
}

export interface ColumnWidths {
  /** Width of the left/main column. */
  main: number;
  /** Width of the right-hand panel, or null when the terminal is too narrow to sit them side by side. */
  side: number | null;
}

/** Splits `total` into the main column and the fixed-width side panel, collapsing to a single stacked column when there isn't room. */
export function splitColumns(total: number): ColumnWidths {
  if (total < MIN_TWO_COLUMN_WIDTH) return { main: total, side: null };
  return { main: total - SIDE_PANEL_WIDTH - COLUMN_GAP, side: SIDE_PANEL_WIDTH };
}
