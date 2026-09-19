import { test } from "node:test";
import assert from "node:assert/strict";

// Rate limiting is read from env at module load, so set it before importing.
process.env.MUSICBRAINZ_MIN_INTERVAL_MS = "0";
const { searchArtist, getDiscography } = await import("./musicbrainz.js");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("searchArtist", async (t) => {
  await t.test("returns the top match", async () => {
    t.mock.method(globalThis, "fetch", async (url: string) => {
      assert.match(url, /\/artist\/\?query=/);
      return jsonResponse({
        artists: [{ id: "artist-1", name: "Radiohead", score: 100, disambiguation: "UK band" }],
      });
    });

    const artist = await searchArtist("Radiohead");
    assert.deepEqual(artist, { id: "artist-1", name: "Radiohead", disambiguation: "UK band" });
  });

  await t.test("throws when nothing matches", async () => {
    t.mock.method(globalThis, "fetch", async () => jsonResponse({ artists: [] }));

    await assert.rejects(() => searchArtist("Nonexistent Band Xyz"), /No MusicBrainz artist found/);
  });

  await t.test("throws on a non-OK response", async () => {
    t.mock.method(globalThis, "fetch", async () => new Response("", { status: 503 }));

    await assert.rejects(() => searchArtist("Radiohead"), /MusicBrainz request failed \(503\)/);
  });
});

test("getDiscography", async (t) => {
  await t.test("collects tracks across release-groups, filtering out compilations", async () => {
    const calls: string[] = [];

    t.mock.method(globalThis, "fetch", async (url: string) => {
      calls.push(url);

      if (url.includes("/release-group?")) {
        return jsonResponse({
          "release-group-count": 2,
          "release-groups": [
            {
              id: "rg-album",
              title: "OK Computer",
              "primary-type": "Album",
              "secondary-types": [],
              "first-release-date": "1997-05-21",
            },
            {
              id: "rg-comp",
              title: "Greatest Hits",
              "primary-type": "Album",
              "secondary-types": ["Compilation"],
              "first-release-date": "2008-01-01",
            },
          ],
        });
      }

      if (url.includes("/release?release-group=rg-album")) {
        return jsonResponse({
          releases: [
            {
              id: "rel-1",
              media: [
                {
                  tracks: [
                    { id: "t1", title: "Airbag", recording: { id: "rec-1", title: "Airbag" } },
                    { id: "t2", title: "Karma Police", recording: { id: "rec-2", title: "Karma Police" } },
                  ],
                },
              ],
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const tracks = await getDiscography("artist-1");

    // The compilation's release-group is filtered out entirely, so its release is never fetched.
    assert.ok(!calls.some((u) => u.includes("release-group=rg-comp")));

    assert.deepEqual(
      tracks.map((t) => t.title),
      ["Airbag", "Karma Police"],
    );
    assert.equal(tracks[0].album, "OK Computer");
    assert.equal(tracks[0].releaseDate, "1997-05-21");
  });

  await t.test("dedupes the same normalized title across release-groups, keeping the earliest", async () => {
    t.mock.method(globalThis, "fetch", async (url: string) => {
      if (url.includes("/release-group?")) {
        return jsonResponse({
          "release-group-count": 2,
          "release-groups": [
            {
              id: "rg-early",
              title: "Pablo Honey",
              "primary-type": "Album",
              "secondary-types": [],
              "first-release-date": "1993-02-22",
            },
            {
              id: "rg-late",
              title: "Pablo Honey (Reissue)",
              "primary-type": "Album",
              "secondary-types": [],
              "first-release-date": "2008-01-01",
            },
          ],
        });
      }

      if (url.includes("release-group=rg-early")) {
        return jsonResponse({
          releases: [
            { id: "r1", media: [{ tracks: [{ id: "t1", title: "Creep", recording: { id: "rec-early", title: "Creep" } }] }] },
          ],
        });
      }

      if (url.includes("release-group=rg-late")) {
        return jsonResponse({
          releases: [
            {
              id: "r2",
              media: [{ tracks: [{ id: "t2", title: "Creep (Remastered)", recording: { id: "rec-late", title: "Creep (Remastered)" } }] }],
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const tracks = await getDiscography("artist-1");

    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].mbid, "rec-early");
    assert.equal(tracks[0].album, "Pablo Honey");
  });
});
