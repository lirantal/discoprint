import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APIConnectionError,
  APITimeoutError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  TypeSafeError,
} from "@typesafe-ai/sdk";
import { describeError, KnownError } from "./errors.js";

test("describeError", async (t) => {
  await t.test("a KnownError is shown as-is, without a stack trace", () => {
    const result = describeError(new KnownError("No artist named \"Nonexistent\" found on MusicBrainz."));
    assert.equal(result.known, true);
    assert.equal(result.message, 'No artist named "Nonexistent" found on MusicBrainz.');
  });

  await t.test("AuthenticationError points at the API key setup", () => {
    const err = new AuthenticationError(401, { detail: { message: "bad key" } }, new Headers());
    const result = describeError(err);
    assert.equal(result.known, true);
    assert.match(result.message, /TYPESAFE_API_KEY/);
    assert.match(result.message, /console\.typesafe\.ai\/keys/);
  });

  await t.test("RateLimitError suggests waiting or lowering --limit", () => {
    const err = new RateLimitError(429, { detail: { message: "slow down" } }, new Headers());
    const result = describeError(err);
    assert.equal(result.known, true);
    assert.match(result.message, /--limit/);
  });

  await t.test("RateLimitError includes the retry delay when the server sends one", () => {
    const err = new RateLimitError(429, { detail: { message: "slow down" } }, new Headers({ "retry-after": "5" }));
    const result = describeError(err);
    assert.match(result.message, /Retry in about 5s/);
  });

  await t.test("PermissionDeniedError explains it's an access issue", () => {
    const err = new PermissionDeniedError(403, { detail: { message: "nope" } }, new Headers());
    const result = describeError(err);
    assert.equal(result.known, true);
    assert.match(result.message, /doesn't have access/);
  });

  await t.test("APIConnectionError (and its subclass APITimeoutError) point at connectivity", () => {
    const connErr = new APIConnectionError();
    assert.equal(describeError(connErr).known, true);
    assert.match(describeError(connErr).message, /Could not reach the TypeSafe API/);

    const timeoutErr = new APITimeoutError(30_000);
    assert.equal(describeError(timeoutErr).known, true);
    assert.match(describeError(timeoutErr).message, /Could not reach the TypeSafe API/);
  });

  await t.test("other APIError subclasses get a generic but clean TypeSafe API message", () => {
    const notFound = new NotFoundError(404, { detail: { message: "no such model" } }, new Headers());
    const badRequest = new BadRequestError(400, { detail: { message: "bad payload" } }, new Headers());

    assert.match(describeError(notFound).message, /^TypeSafe API error:/);
    assert.match(describeError(badRequest).message, /^TypeSafe API error:/);
    assert.equal(describeError(notFound).known, true);
  });

  await t.test("a bare TypeSafeError gets a generic SDK-error message", () => {
    const result = describeError(new TypeSafeError("something the SDK itself rejected"));
    assert.equal(result.known, true);
    assert.match(result.message, /^TypeSafe SDK error:/);
  });

  await t.test("a raw fetch network failure is explained without a stack trace", () => {
    const result = describeError(new TypeError("fetch failed"));
    assert.equal(result.known, true);
    assert.match(result.message, /Check your internet connection/);
  });

  await t.test("anything unrecognized is reported as unknown, keeping the stack trace", () => {
    const result = describeError(new RangeError("something we never anticipated"));
    assert.equal(result.known, false);
    assert.equal(result.message, "something we never anticipated");
  });

  await t.test("a non-Error thrown value still produces a message", () => {
    const result = describeError("just a string");
    assert.equal(result.known, false);
    assert.equal(result.message, "just a string");
  });
});
