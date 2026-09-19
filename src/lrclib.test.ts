import { test } from "node:test";
import assert from "node:assert/strict";
import { KnownError } from "./errors.js";

process.env.LRCLIB_MIN_INTERVAL_MS = "0";
const { fetchLyrics } = await import("./lrclib.js");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("fetchLyrics", async (t) => {
  await t.test("returns plain lyrics from a direct /get match", async () => {
    t.mock.method(globalThis, "fetch", async (url: string) => {
      assert.match(url, /\/api\/get\?/);
      return jsonResponse({
        trackName: "Airbag",
        artistName: "Radiohead",
        plainLyrics: "In the next world war...",
        instrumental: false,
      });
    });

    const result = await fetchLyrics("Radiohead", "Airbag");
    assert.deepEqual(result, { plainLyrics: "In the next world war...", source: "lrclib-get" });
  });

  await t.test("treats an instrumental /get match as having no lyrics, without falling back", async () => {
    let searchCalled = false;
    t.mock.method(globalThis, "fetch", async (url: string) => {
      if (url.includes("/api/get")) {
        return jsonResponse({ trackName: "Treefingers", artistName: "Radiohead", plainLyrics: null, instrumental: true });
      }
      searchCalled = true;
      return jsonResponse([]);
    });

    const result = await fetchLyrics("Radiohead", "Treefingers");
    assert.deepEqual(result, { plainLyrics: null, source: "lrclib-get" });
    assert.equal(searchCalled, false);
  });

  await t.test("falls back to /search when /get 404s, using the first hit with lyrics", async () => {
    t.mock.method(globalThis, "fetch", async (url: string) => {
      if (url.includes("/api/get")) {
        return new Response("", { status: 404 });
      }
      assert.match(url, /\/api\/search\?/);
      return jsonResponse([
        { trackName: "Airbag", artistName: "Radiohead", plainLyrics: null, instrumental: false },
        { trackName: "Airbag", artistName: "Radiohead", plainLyrics: "found via search", instrumental: false },
      ]);
    });

    const result = await fetchLyrics("Radiohead", "Airbag");
    assert.deepEqual(result, { plainLyrics: "found via search", source: "lrclib-search" });
  });

  await t.test("returns no-lyrics when neither endpoint has a match", async () => {
    t.mock.method(globalThis, "fetch", async (url: string) => {
      if (url.includes("/api/get")) return new Response("", { status: 404 });
      return jsonResponse([]);
    });

    const result = await fetchLyrics("Some Artist", "Some Obscure B-Side");
    assert.deepEqual(result, { plainLyrics: null, source: "none" });
  });

  await t.test("wraps a network failure as a KnownError instead of a raw fetch error", async () => {
    t.mock.method(globalThis, "fetch", async () => {
      throw new TypeError("fetch failed");
    });

    await assert.rejects(
      () => fetchLyrics("Radiohead", "Airbag"),
      (err: unknown) => err instanceof KnownError && /Could not reach lrclib\.net/.test(err.message),
    );
  });
});
