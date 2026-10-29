import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDuration, formatTokenCount, formatUsd } from "./format.js";

test("formatTokenCount", () => {
  assert.equal(formatTokenCount(42), "42");
  assert.equal(formatTokenCount(1500), "1.5K");
  assert.equal(formatTokenCount(2_500_000), "2.5M");
});

test("formatDuration", () => {
  assert.equal(formatDuration(500), "500ms");
  assert.equal(formatDuration(1500), "1.5s");
});

test("formatUsd", () => {
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(0.0001), "$0.0001");
  assert.equal(formatUsd(1.5), "$1.50");
});
