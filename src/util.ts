import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Strips common re-release/remaster noise so the same song across editions dedupes to one entry. */
export function normalizeTrackTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(
      /\s*[-–—([].*?(remaster(ed)?|live|deluxe|mono|stereo|edit|version|bonus track|acoustic)[^)\]]*[)\]]?\s*$/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readJsonCache<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonCache(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
}
