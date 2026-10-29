import { test } from "node:test";
import assert from "node:assert/strict";
import { clampWidth, COLUMN_GAP, SIDE_PANEL_WIDTH, splitColumns } from "./layout.js";

test("clampWidth", async (t) => {
  await t.test("treats a 0-column report as unset, not as a 0-wide terminal (regression)", () => {
    // Some ptys report a literal 0 before a real size is known — see
    // docs/decisions.md "Terminal width can report 0, not just undefined".
    assert.equal(clampWidth(0), 80);
    assert.equal(clampWidth(undefined), 80);
  });

  await t.test("clamps to a renderable range", () => {
    assert.equal(clampWidth(20), 40);
    assert.equal(clampWidth(400), 120);
    assert.equal(clampWidth(100), 100);
  });
});

test("splitColumns", async (t) => {
  await t.test("gives the side panel a fixed width and the rest to the main column", () => {
    const { main, side } = splitColumns(120);
    assert.equal(side, SIDE_PANEL_WIDTH);
    assert.equal(main, 120 - SIDE_PANEL_WIDTH - COLUMN_GAP);
  });

  await t.test("the two columns plus their gap exactly fill the available width", () => {
    for (const total of [89, 100, 113, 120]) {
      const { main, side } = splitColumns(total);
      assert.ok(side !== null);
      assert.equal(main + COLUMN_GAP + side, total);
    }
  });

  await t.test("stacks into one column when the terminal is too narrow to split", () => {
    const { main, side } = splitColumns(60);
    assert.equal(side, null);
    assert.equal(main, 60);
  });
});
