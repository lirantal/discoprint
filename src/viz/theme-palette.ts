// Single source of truth for theme -> color, so a future HTML/SVG renderer
// (or anything else) uses the exact same palette as the terminal one.
export const THEME_PALETTE: Record<string, { hex: string; label: string }> = {
  love: { hex: "#f472b6", label: "love" },
  heartbreak: { hex: "#60a5fa", label: "heartbreak" },
  party_fun: { hex: "#fbbf24", label: "party/fun" },
  money_success: { hex: "#34d399", label: "money/success" },
  social_political: { hex: "#a78bfa", label: "social/political" },
  loss_grief: { hex: "#94a3b8", label: "loss/grief" },
  self_reflection: { hex: "#22d3ee", label: "self-reflection" },
  other: { hex: "#6b7280", label: "other" },
};

export const UNKNOWN_THEME_COLOR = { hex: "#6b7280", label: "unknown" };

export function themeColor(theme: string): { hex: string; label: string } {
  return THEME_PALETTE[theme] ?? UNKNOWN_THEME_COLOR;
}
