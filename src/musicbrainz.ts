import { KnownError } from "./errors.js";
import type { Track } from "./types.js";
import { normalizeTrackTitle, sleep } from "./util.js";

const MB_BASE = "https://musicbrainz.org/ws/2";

// MusicBrainz requires a meaningful User-Agent identifying your app + contact.
// Update the contact URL/email before any real usage: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
const USER_AGENT = "artist-lyrics-classifier/0.1.0 ( https://github.com/your-username/artist-lyrics-classifier )";

// MusicBrainz asks for at most 1 request/second from unauthenticated clients.
// Overridable so tests don't have to eat the real delay.
const MIN_INTERVAL_MS = Number(process.env.MUSICBRAINZ_MIN_INTERVAL_MS ?? 1100);
let lastRequestAt = 0;

// Per MusicBrainz's own docs, a 503 specifically means "rate limit exceeded"
// (their side, often from other traffic sharing your egress IP) rather than a
// generic outage — so it's worth a few retries with backoff before giving up.
const MAX_RETRIES = Number(process.env.MUSICBRAINZ_MAX_RETRIES ?? 5);
const RETRY_BASE_MS = Number(process.env.MUSICBRAINZ_RETRY_BASE_MS ?? 1000);

async function mbFetch<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    let res: Response;
    try {
      res = await fetch(`${MB_BASE}${path}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
    } catch (cause) {
      throw new KnownError("Could not reach MusicBrainz (musicbrainz.org). Check your internet connection.", { cause });
    }

    if (res.ok) {
      return (await res.json()) as T;
    }

    if (res.status === 503 && attempt < MAX_RETRIES) {
      const backoff = RETRY_BASE_MS * 2 ** attempt;
      console.warn(
        `MusicBrainz rate-limited (503), retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`,
      );
      await sleep(backoff);
      continue;
    }

    throw new KnownError(
      `MusicBrainz request failed (${res.status} on ${path}). This is usually transient — try again shortly.`,
    );
  }
}

interface ArtistSearchResponse {
  artists: Array<{ id: string; name: string; score: number; disambiguation?: string }>;
}

export interface ResolvedArtist {
  id: string;
  name: string;
  disambiguation?: string;
}

export async function searchArtist(name: string): Promise<ResolvedArtist> {
  const query = encodeURIComponent(`artist:"${name}"`);
  const data = await mbFetch<ArtistSearchResponse>(`/artist/?query=${query}&fmt=json&limit=5`);
  const best = data.artists[0];
  if (!best) {
    throw new KnownError(
      `No artist named "${name}" found on MusicBrainz. Check the spelling, or try a different/more specific name.`,
    );
  }
  return { id: best.id, name: best.name, disambiguation: best.disambiguation };
}

interface ReleaseGroupsResponse {
  "release-group-count": number;
  "release-groups": Array<{
    id: string;
    title: string;
    "primary-type": string | null;
    "secondary-types": string[];
    "first-release-date": string;
  }>;
}

interface ReleaseGroup {
  id: string;
  title: string;
  firstReleaseDate: string;
}

/** Album/EP release-groups only, excluding compilations/live/remix noise by default. */
async function getReleaseGroups(artistId: string, includeNonAlbums: boolean): Promise<ReleaseGroup[]> {
  const excludedSecondary = new Set(["Compilation", "Live", "Remix", "Soundtrack", "Interview", "Spokenword"]);
  const groups: ReleaseGroup[] = [];
  let offset = 0;
  const limit = 100;

  for (;;) {
    const type = includeNonAlbums ? "" : "&type=album|ep";
    const data = await mbFetch<ReleaseGroupsResponse>(
      `/release-group?artist=${artistId}${type}&fmt=json&limit=${limit}&offset=${offset}`,
    );
    for (const rg of data["release-groups"]) {
      if (!includeNonAlbums && rg["secondary-types"]?.some((t) => excludedSecondary.has(t))) continue;
      groups.push({ id: rg.id, title: rg.title, firstReleaseDate: rg["first-release-date"] ?? "" });
    }
    offset += limit;
    if (offset >= data["release-group-count"]) break;
  }

  return groups.sort((a, b) => (a.firstReleaseDate || "9999").localeCompare(b.firstReleaseDate || "9999"));
}

interface ReleaseBrowseResponse {
  releases: Array<{
    id: string;
    media: Array<{
      tracks: Array<{ id: string; title: string; recording: { id: string; title: string } }>;
    }>;
  }>;
}

async function getTracksForReleaseGroup(rg: ReleaseGroup): Promise<Track[]> {
  const data = await mbFetch<ReleaseBrowseResponse>(`/release?release-group=${rg.id}&inc=recordings&fmt=json&limit=1`);
  const release = data.releases[0];
  if (!release) return [];

  const tracks: Track[] = [];
  for (const medium of release.media) {
    for (const t of medium.tracks) {
      tracks.push({
        mbid: t.recording.id,
        title: t.recording.title,
        normalizedTitle: normalizeTrackTitle(t.recording.title),
        album: rg.title,
        releaseDate: rg.firstReleaseDate || undefined,
      });
    }
  }
  return tracks;
}

/**
 * Full discography for an artist, deduped across editions/reissues by normalized
 * title (first/earliest release wins). One MusicBrainz request per release-group,
 * so this is slow (~1.1s/album) by design to respect their rate limit.
 */
export async function getDiscography(
  artistId: string,
  options: { includeNonAlbums?: boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<Track[]> {
  const releaseGroups = await getReleaseGroups(artistId, options.includeNonAlbums ?? false);

  const seen = new Map<string, Track>();
  for (const [i, rg] of releaseGroups.entries()) {
    const tracks = await getTracksForReleaseGroup(rg);
    for (const track of tracks) {
      if (!seen.has(track.normalizedTitle)) {
        seen.set(track.normalizedTitle, track);
      }
    }
    options.onProgress?.(i + 1, releaseGroups.length);
  }

  return [...seen.values()].sort((a, b) => (a.releaseDate || "9999").localeCompare(b.releaseDate || "9999"));
}
