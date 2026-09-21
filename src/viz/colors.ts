// Minimal 24-bit ("truecolor") ANSI helpers. No chalk/picocolors dependency —
// this is the one place in the codebase that still hand-rolls ANSI codes
// directly, for the plain (non-Ink) terminal visualization renderer.
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (v: number) =>
    Math.round(clamp(v, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Linearly interpolates between two hex colors. `t` is clamped to [0, 1]. */
export function mixHex(fromHex: string, toHex: string, t: number): string {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const clamped = clamp(t, 0, 1);
  return rgbToHex({
    r: from.r + (to.r - from.r) * clamped,
    g: from.g + (to.g - from.g) * clamped,
    b: from.b + (to.b - from.b) * clamped,
  });
}

/** Three-stop gradient (red -> yellow -> green) for a 0..1 "how good is this" value. */
export function moodGradientHex(t: number): string {
  const clamped = clamp(t, 0, 1);
  return clamped < 0.5 ? mixHex("#ef4444", "#eab308", clamped * 2) : mixHex("#eab308", "#22c55e", (clamped - 0.5) * 2);
}

export function fg(text: string, hex: string, enabled = true): string {
  if (!enabled || text === "") return text;
  const { r, g, b } = hexToRgb(hex);
  return `[38;2;${r};${g};${b}m${text}[0m`;
}

export function dim(text: string, enabled = true): string {
  return enabled && text !== "" ? `[2m${text}[0m` : text;
}

export function bold(text: string, enabled = true): string {
  return enabled && text !== "" ? `[1m${text}[0m` : text;
}

export function colorsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NO_COLOR === undefined;
}
