import type { LyricsResult } from "./types.js";
import { sleep } from "./util.js";

const LRCLIB_BASE = "https://lrclib.net/api";
const USER_AGENT = "artist-lyrics-classifier/0.1.0";

// lrclib.net has no documented rate limit; we're polite anyway.
// Overridable so tests don't have to eat the real delay.
const MIN_INTERVAL_MS = Number(process.env.LRCLIB_MIN_INTERVAL_MS ?? 300);
let lastRequestAt = 0;

async function lrclibFetch(path: string): Promise<Response> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  return fetch(`${LRCLIB_BASE}${path}`, { headers: { "User-Agent": USER_AGENT } });
}

interface LrclibItem {
  trackName: string;
  artistName: string;
  plainLyrics: string | null;
  instrumental: boolean;
}

export async function fetchLyrics(artist: string, track: string): Promise<LyricsResult> {
  const getQuery = `artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}`;
  const getRes = await lrclibFetch(`/get?${getQuery}`);
  if (getRes.ok) {
    const item = (await getRes.json()) as LrclibItem;
    if (item.plainLyrics) return { plainLyrics: item.plainLyrics, source: "lrclib-get" };
    if (item.instrumental) return { plainLyrics: null, source: "lrclib-get" };
  }

  const searchRes = await lrclibFetch(`/search?${getQuery}`);
  if (searchRes.ok) {
    const results = (await searchRes.json()) as LrclibItem[];
    const hit = results.find((r) => r.plainLyrics);
    if (hit?.plainLyrics) return { plainLyrics: hit.plainLyrics, source: "lrclib-search" };
  }

  return { plainLyrics: null, source: "none" };
}
