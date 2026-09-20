import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySong, estimateCostUsd } from "./jev.js";

process.env.TYPESAFE_API_KEY = "test-key";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CANNED_ANSWERS = {
  theme: { type: "choice", choice: "heartbreak", confidence: 0.82, probabilities: { heartbreak: 0.82 } },
  mood: { type: "score", score: 0.6, confidence: 0.7, probabilities: {}, legend: {} },
  complexity: { type: "score", score: 2.1, confidence: 0.65, probabilities: {}, legend: {} },
  explicit: { type: "noul", noul: 0.02 },
  firstPerson: { type: "noul", noul: 0.95 },
};

test("classifySong", async (t) => {
  await t.test("sends state + all 5 batched questions, and maps the response", async () => {
    let capturedBody: any;

    t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
      assert.match(url, /\/v1\/systemone$/);
      assert.equal(init.method, "POST");
      capturedBody = JSON.parse(init.body as string);
      return jsonResponse({
        answers: CANNED_ANSWERS,
        model: "jev-latest",
        usage: { input_tokens: 100, output_tokens: 10 },
      });
    });

    const result = await classifySong({
      artist: "Radiohead",
      track: "Airbag",
      album: "OK Computer",
      releaseDate: "1997-05-21",
      lyrics: "In the next world war...",
      lyricsSource: "lrclib-get",
    });

    // Request shape: state carries exactly artist/track/lyrics, and all 5 questions are batched.
    assert.deepEqual(capturedBody.state, {
      artist: "Radiohead",
      track: "Airbag",
      lyrics: "In the next world war...",
    });
    assert.deepEqual(Object.keys(capturedBody.questions).sort(), [
      "complexity",
      "explicit",
      "firstPerson",
      "mood",
      "theme",
    ]);
    assert.equal(capturedBody.questions.theme.type, "choice");
    assert.ok("heartbreak" in capturedBody.questions.theme.criteria);
    assert.equal(capturedBody.questions.mood.type, "score");
    assert.equal(capturedBody.questions.explicit.type, "noul");

    // Response mapping: answers land in the right SongClassification fields.
    assert.deepEqual(result.classification, {
      artist: "Radiohead",
      track: "Airbag",
      album: "OK Computer",
      releaseDate: "1997-05-21",
      lyricsSource: "lrclib-get",
      theme: "heartbreak",
      themeConfidence: 0.82,
      mood: 0.6,
      moodConfidence: 0.7,
      complexity: 2.1,
      complexityConfidence: 0.65,
      explicit: 0.02,
      firstPerson: 0.95,
    });

    // Usage: model + token counts come straight from the response, duration is measured.
    assert.equal(result.usage.model, "jev-latest");
    assert.equal(result.usage.inputTokens, 100);
    assert.equal(result.usage.outputTokens, 10);
    assert.ok(result.usage.durationMs >= 0);
  });

  await t.test("propagates an API error instead of swallowing it", async () => {
    t.mock.method(globalThis, "fetch", async () =>
      jsonResponse({ detail: { error_type: "authentication_error", message: "bad key" } }, 401),
    );

    await assert.rejects(() =>
      classifySong({
        artist: "Radiohead",
        track: "Airbag",
        album: "OK Computer",
        lyrics: "lyrics",
        lyricsSource: "lrclib-get",
      }),
    );
  });
});

test("estimateCostUsd", async (t) => {
  await t.test("charges only for input tokens, at $0.042 per million", () => {
    assert.equal(estimateCostUsd(1_000_000), 0.042);
    assert.equal(estimateCostUsd(0), 0);
  });

  await t.test("scales linearly", () => {
    assert.equal(estimateCostUsd(2_000_000), estimateCostUsd(1_000_000) * 2);
  });
});
