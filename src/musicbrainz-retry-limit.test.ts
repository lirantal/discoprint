import { test } from "node:test";
import assert from "node:assert/strict";
import { KnownError } from "./errors.js";

// A dedicated file (its own process, its own module instance) so this can set
// a low MUSICBRAINZ_MAX_RETRIES without a second musicbrainz.js instance
// coexisting with musicbrainz.test.ts's — two instances in one process would
// otherwise clobber each other's V8 coverage attribution for the file.
process.env.MUSICBRAINZ_MIN_INTERVAL_MS = "0";
process.env.MUSICBRAINZ_RETRY_BASE_MS = "0";
process.env.MUSICBRAINZ_MAX_RETRIES = "2";
const { searchArtist } = await import("./musicbrainz.js");

test("searchArtist gives up after exhausting retries on a persistent 503", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("", { status: 503 });
  });

  await assert.rejects(
    () => searchArtist("Radiohead"),
    (err: unknown) => err instanceof KnownError && /MusicBrainz request failed \(503 on/.test(err.message),
  );
  assert.equal(calls, 3); // initial attempt + 2 retries
});
