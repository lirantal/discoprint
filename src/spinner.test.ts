import { test } from "node:test";
import assert from "node:assert/strict";
import { sleep } from "./util.js";

// Tick fast so tests don't eat real 80ms waits per frame.
process.env.SPINNER_FRAME_INTERVAL_MS = "5";
const { canAnimate, startSpinner, startTaskList } = await import("./spinner.js");

function fakeOutput(): NodeJS.WritableStream & { columns: number; isTTY?: boolean; chunks: string[] } {
  const chunks: string[] = [];
  return {
    columns: 80,
    chunks,
    write(chunk: string): boolean {
      chunks.push(chunk);
      return true;
    },
  } as unknown as NodeJS.WritableStream & { columns: number; isTTY?: boolean; chunks: string[] };
}

test("canAnimate", async (t) => {
  await t.test("false when CI is set, even on a TTY", () => {
    assert.equal(canAnimate({ isTTY: true } as NodeJS.WritableStream & { isTTY: boolean }, { CI: "true" }), false);
  });

  await t.test("false when not a TTY", () => {
    assert.equal(canAnimate({ isTTY: false } as NodeJS.WritableStream & { isTTY: boolean }, {}), false);
  });

  await t.test("true on a TTY outside CI", () => {
    assert.equal(canAnimate({ isTTY: true } as NodeJS.WritableStream & { isTTY: boolean }, {}), true);
  });

  await t.test("CI=0/false/'' don't count as CI", () => {
    for (const value of ["0", "false", ""]) {
      assert.equal(canAnimate({ isTTY: true } as NodeJS.WritableStream & { isTTY: boolean }, { CI: value }), true);
    }
  });
});

test("startSpinner", async (t) => {
  await t.test("hides the cursor, animates frames, and shows the cursor again on stop", async () => {
    const output = fakeOutput();
    const spinner = startSpinner("Working…", output);
    await sleep(30);
    spinner.stop("✔ Done.");

    const written = output.chunks.join("");
    assert.ok(written.includes("\x1B[?25l")); // hide
    assert.ok(written.includes("\x1B[?25h")); // show
    assert.ok(written.includes("Working…"));
    assert.ok(written.includes("✔ Done."));
    // More than one frame should have painted in 30ms at a 5ms interval.
    assert.ok(output.chunks.length > 2);
  });

  await t.test("update() changes the label shown on the next tick", async () => {
    const output = fakeOutput();
    const spinner = startSpinner("Step 1", output);
    spinner.update("Step 2");
    await sleep(20);
    spinner.stop("✔ Done.");

    assert.ok(output.chunks.some((c) => c.includes("Step 2")));
  });

  await t.test("doesn't collapse the label when columns is 0 (regression)", async () => {
    // Some pty layers report 0 columns, not undefined, before a real size is
    // known. A `??` fallback misses that (0 isn't null/undefined) and used
    // to truncate every label down to a single character.
    const output = fakeOutput();
    output.columns = 0;
    const spinner = startSpinner("Resolving artist…", output);
    await sleep(10);
    spinner.stop("done");

    assert.ok(output.chunks.some((c) => c.includes("Resolving artist…")));
  });

  await t.test("stops writing once stopped", async () => {
    const output = fakeOutput();
    const spinner = startSpinner("Working…", output);
    await sleep(15);
    spinner.stop("✔ Done.");
    const countAtStop = output.chunks.length;
    await sleep(20);
    assert.equal(output.chunks.length, countAtStop);
  });
});

test("startTaskList", async (t) => {
  await t.test("renders one line per item and lets each complete independently", async () => {
    const output = fakeOutput();
    const list = startTaskList(
      [
        { id: "a", label: "Song A" },
        { id: "b", label: "Song B" },
      ],
      output,
    );

    await sleep(15);
    list.complete("a", "✔ Song A — love, mood 3.2");
    await sleep(15);
    list.stop();

    const written = output.chunks.join("");
    assert.ok(written.includes("Song A"));
    assert.ok(written.includes("Song B"));
    assert.ok(written.includes("✔ Song A — love, mood 3.2"));
  });

  await t.test("handles an empty item list without crashing or animating forever", async () => {
    const output = fakeOutput();
    const list = startTaskList([], output);
    await sleep(15);
    list.stop();
    // No frames to animate, but shouldn't throw and should still restore the cursor.
    assert.ok(output.chunks.join("").includes("\x1B[?25h"));
  });
});
