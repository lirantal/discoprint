import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeTrackTitle, readJsonCache, slugify, sleep, writeJsonCache } from "./util.js";

test("slugify", async (t) => {
  await t.test("lowercases and hyphenates", () => {
    assert.equal(slugify("Hello World"), "hello-world");
  });

  await t.test("strips accents", () => {
    assert.equal(slugify("Beyoncé"), "beyonce");
  });

  await t.test("collapses non-alphanumeric runs and trims edges", () => {
    assert.equal(slugify("  Radiohead: OK Computer!! "), "radiohead-ok-computer");
  });
});

test("normalizeTrackTitle", async (t) => {
  await t.test("passes through a plain title", () => {
    assert.equal(normalizeTrackTitle("Creep"), "creep");
  });

  await t.test("strips a remastered suffix", () => {
    assert.equal(normalizeTrackTitle("Creep (Remastered)"), "creep");
  });

  await t.test("strips a live tag with dash separator", () => {
    assert.equal(normalizeTrackTitle("Karma Police - Live"), "karma police");
  });

  await t.test("strips a deluxe edition bracket", () => {
    assert.equal(normalizeTrackTitle("Idioteque [Deluxe Edition]"), "idioteque");
  });

  await t.test("leaves an unrelated parenthetical alone", () => {
    assert.equal(normalizeTrackTitle("Say It Ain't So (feat. Someone)"), "say it ain't so (feat. someone)");
  });
});

test("sleep resolves after roughly the requested delay", async () => {
  const started = Date.now();
  await sleep(20);
  assert.ok(Date.now() - started >= 15);
});

test("readJsonCache / writeJsonCache", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "alc-util-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  await t.test("returns null for a missing file", async () => {
    const result = await readJsonCache(join(dir, "missing.json"));
    assert.equal(result, null);
  });

  await t.test("round-trips written data, creating parent dirs", async () => {
    const path = join(dir, "nested", "value.json");
    await writeJsonCache(path, { hello: "world", n: 3 });
    const result = await readJsonCache<{ hello: string; n: number }>(path);
    assert.deepEqual(result, { hello: "world", n: 3 });
  });
});
