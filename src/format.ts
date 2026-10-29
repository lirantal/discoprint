// Small display-formatting helpers shared by every renderer (the plain
// terminal dashboard, the live Ink view, and the Ink dashboard it settles
// into) — kept in one place instead of copied into each.

export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function formatUsd(amountUsd: number): string {
  if (amountUsd === 0) return "$0.00";
  return amountUsd < 0.01 ? `$${amountUsd.toFixed(4)}` : `$${amountUsd.toFixed(2)}`;
}
