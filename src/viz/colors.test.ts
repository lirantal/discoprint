import { test } from "node:test";
import assert from "node:assert/strict";
import { bold, clamp, dim, fg, hexToRgb, mixHex, moodGradientHex } from "./colors.js";

test("clamp", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

test("hexToRgb", () => {
  assert.deepEqual(hexToRgb("#ff0000"), { r: 255, g: 0, b: 0 });
  assert.deepEqual(hexToRgb("00ff00"), { r: 0, g: 255, b: 0 });
});

test("mixHex", async (t) => {
  await t.test("t=0 returns the first color", () => {
    assert.equal(mixHex("#ff0000", "#00ff00", 0), "#ff0000");
  });

  await t.test("t=1 returns the second color", () => {
    assert.equal(mixHex("#ff0000", "#00ff00", 1), "#00ff00");
  });

  await t.test("t=0.5 is the midpoint", () => {
    assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
  });

  await t.test("out-of-range t is clamped", () => {
    assert.equal(mixHex("#ff0000", "#00ff00", 5), "#00ff00");
    assert.equal(mixHex("#ff0000", "#00ff00", -5), "#ff0000");
  });
});

test("moodGradientHex", async (t) => {
  await t.test("0 is red", () => {
    assert.equal(moodGradientHex(0), "#ef4444");
  });

  await t.test("0.5 is yellow", () => {
    assert.equal(moodGradientHex(0.5), "#eab308");
  });

  await t.test("1 is green", () => {
    assert.equal(moodGradientHex(1), "#22c55e");
  });
});

test("fg / dim / bold", async (t) => {
  await t.test("wraps text in an ANSI escape when enabled", () => {
    assert.equal(fg("hi", "#ff0000", true), "[38;2;255;0;0mhi[0m");
    assert.match(dim("hi", true), /^\[2mhi\[0m$/);
    assert.match(bold("hi", true), /^\[1mhi\[0m$/);
  });

  await t.test("returns plain text when disabled", () => {
    assert.equal(fg("hi", "#ff0000", false), "hi");
    assert.equal(dim("hi", false), "hi");
    assert.equal(bold("hi", false), "hi");
  });

  await t.test("never wraps an empty string, even when enabled", () => {
    assert.equal(fg("", "#ff0000", true), "");
    assert.equal(dim("", true), "");
    assert.equal(bold("", true), "");
  });
});
