import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { canPromptInteractively, promptPassword, promptText } from "./prompt.js";

function fakeTty(): PassThrough & { isTTY: boolean } {
  const stream = new PassThrough() as PassThrough & { isTTY: boolean };
  stream.isTTY = true;
  return stream;
}

type RawTty = PassThrough & {
  isTTY: boolean;
  isRaw: boolean;
  setRawMode: (mode: boolean) => void;
  ref: () => void;
  unref: () => void;
};

/**
 * A TTY-like stream that also supports setRawMode (plus the ref/unref Ink
 * expects on a real tty.ReadStream) — every prompt now reads keystrokes
 * itself via Ink's raw-mode input, unlike the old readline-based prompt
 * which only needed raw mode for the masked password path.
 */
function fakeRawTty(): RawTty {
  const stream = new PassThrough() as RawTty;
  stream.isTTY = true;
  stream.isRaw = false;
  stream.setRawMode = (mode: boolean) => {
    stream.isRaw = mode;
  };
  stream.ref = () => undefined;
  stream.unref = () => undefined;
  return stream;
}

function collect(output: PassThrough): { text: () => string } {
  let buffer = "";
  output.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
  });
  return { text: () => buffer };
}

// Ink throttles renders to ~30fps (one flush per ~33ms) by default, so this
// has to clear that window — otherwise two state changes made back-to-back
// (e.g. a validation error immediately followed by retyping) can collapse
// into a single flushed frame and the intermediate one never reaches output.
function wait(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulates typing, then pressing Enter, as a real keyboard would: as
 * separate reads. Ink's input parser treats a run of plain characters
 * sharing one chunk as pasted text (it doesn't split on `\r` because that
 * byte can legitimately appear inside a paste), so a combined
 * `"Radiohead\r"` write is never recognized as pressing Return.
 */
async function typeAndSubmit(input: RawTty, text: string): Promise<void> {
  if (text) {
    input.write(text);
    await wait();
  }
  input.write("\r");
  await wait();
}

test("canPromptInteractively", async (t) => {
  await t.test("false when stdin/stdout aren't TTYs", () => {
    const input = new PassThrough() as PassThrough & { isTTY?: boolean };
    const output = new PassThrough() as PassThrough & { isTTY?: boolean };
    assert.equal(canPromptInteractively(input, output, {}), false);
  });

  await t.test("false in a CI environment even with TTYs", () => {
    assert.equal(canPromptInteractively(fakeTty(), fakeTty(), { CI: "true" }), false);
  });

  await t.test("true with TTYs and no CI flag", () => {
    assert.equal(canPromptInteractively(fakeTty(), fakeTty(), {}), true);
  });
});

test("promptText", async (t) => {
  await t.test("returns cancelled immediately when not interactive (no TTY)", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const result = await promptText({ title: "Artist?", summaryLabel: "Artist", input, output });
    assert.deepEqual(result, { status: "cancelled" });
  });

  await t.test("accepts a submitted value", async () => {
    const input = fakeRawTty();
    const output = fakeRawTty();
    const out = collect(output);

    const pending = promptText({ title: "Which artist or band?", summaryLabel: "Artist", input, output, env: {} });
    await wait();
    await typeAndSubmit(input, "Radiohead");
    const result = await pending;

    assert.deepEqual(result, { status: "submitted", value: "Radiohead" });
    assert.match(out.text(), /Which artist or band\?/);
    assert.match(out.text(), /Artist: Radiohead/);
  });

  await t.test("re-prompts on a validation error, then accepts a valid value", async () => {
    const input = fakeRawTty();
    const output = fakeRawTty();
    const out = collect(output);

    const pending = promptText({
      title: "Which artist or band?",
      summaryLabel: "Artist",
      validate: (value) => (value === "" ? "Enter an artist name." : undefined),
      input,
      output,
      env: {},
    });

    await wait();
    await typeAndSubmit(input, ""); // empty -> validation error, should re-prompt
    await typeAndSubmit(input, "Radiohead");

    const result = await pending;
    assert.deepEqual(result, { status: "submitted", value: "Radiohead" });
    assert.match(out.text(), /Enter an artist name\./);
  });

  await t.test("falls back to defaultValue on an empty answer", async () => {
    const input = fakeRawTty();
    const output = fakeRawTty();

    const pending = promptText({
      title: "How many songs to classify?",
      summaryLabel: "Limit",
      defaultValue: "100",
      validate: (value) =>
        Number.isInteger(Number(value)) && Number(value) > 0 ? undefined : "Enter a positive whole number.",
      input,
      output,
      env: {},
    });
    await wait();
    await typeAndSubmit(input, "");

    const result = await pending;
    assert.deepEqual(result, { status: "submitted", value: "100" });
  });

  await t.test("printSummary: false suppresses the '<label>: <value>' echo line", async () => {
    const input = fakeRawTty();
    const output = fakeRawTty();
    const out = collect(output);

    const pending = promptText({
      title: "How many songs to classify?",
      summaryLabel: "Limit",
      printSummary: false,
      input,
      output,
      env: {},
    });
    await wait();
    await typeAndSubmit(input, "5");
    const result = await pending;

    assert.deepEqual(result, { status: "submitted", value: "5" });
    assert.doesNotMatch(out.text(), /Limit: 5/);
    // The typed value stays visible in the input row itself instead.
    assert.match(out.text(), /5/);
  });

  await t.test("cancels when the input stream closes without an answer", async () => {
    const input = fakeRawTty();
    const output = fakeRawTty();

    const pending = promptText({ title: "Which artist or band?", summaryLabel: "Artist", input, output, env: {} });
    await wait();
    input.end();

    const result = await pending;
    assert.deepEqual(result, { status: "cancelled" });
  });

  await t.test("cancels on Escape", async () => {
    const input = fakeRawTty();
    const output = fakeRawTty();

    const pending = promptText({ title: "Which artist or band?", summaryLabel: "Artist", input, output, env: {} });
    await wait();
    input.write("Radio");
    await wait();
    input.write(""); // Escape
    await wait();

    const result = await pending;
    assert.deepEqual(result, { status: "cancelled" });
  });
});

test("promptPassword", async (t) => {
  await t.test("returns cancelled immediately when not interactive (no TTY)", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const result = await promptPassword({ title: "API key?", summaryLabel: "TYPESAFE_API_KEY", input, output });
    assert.deepEqual(result, { status: "cancelled" });
  });

  await t.test("masks each keystroke and never echoes the submitted value", async () => {
    const input = fakeRawTty();
    const output = fakeRawTty();
    const out = collect(output);

    const pending = promptPassword({ title: "API key?", summaryLabel: "TYPESAFE_API_KEY", input, output, env: {} });
    await wait();
    await typeAndSubmit(input, "sk-secret");
    const result = await pending;

    assert.deepEqual(result, { status: "submitted", value: "sk-secret" });
    assert.match(out.text(), /\*{9}/);
    assert.doesNotMatch(out.text(), /sk-secret/);
    assert.doesNotMatch(out.text(), /TYPESAFE_API_KEY: /);
    // Raw mode is switched back off once the prompt settles.
    assert.equal(input.isRaw, false);
  });

  await t.test("backspace removes the last masked character", async () => {
    const input = fakeRawTty();
    const output = fakeRawTty();
    const out = collect(output);

    const pending = promptPassword({ title: "API key?", summaryLabel: "TYPESAFE_API_KEY", input, output, env: {} });
    await wait();
    input.write("abc");
    await wait();
    input.write("\x7f"); // backspace (DEL)
    await wait();
    await typeAndSubmit(input, "d");

    const result = await pending;
    assert.deepEqual(result, { status: "submitted", value: "abd" });
    assert.match(out.text(), /\*{3}/);
    assert.doesNotMatch(out.text(), /ab[cd]/);
  });

  await t.test("cancels on Ctrl+C", async () => {
    const input = fakeRawTty();
    const output = fakeRawTty();

    const pending = promptPassword({ title: "API key?", summaryLabel: "TYPESAFE_API_KEY", input, output, env: {} });
    await wait();
    input.write("partial");
    await wait();
    input.write("\x03"); // Ctrl+C
    await wait();

    const result = await pending;
    assert.deepEqual(result, { status: "cancelled" });
  });

  await t.test("re-prompts on a validation error, then accepts a valid value", async () => {
    const input = fakeRawTty();
    const output = fakeRawTty();
    const out = collect(output);

    const pending = promptPassword({
      title: "API key?",
      summaryLabel: "TYPESAFE_API_KEY",
      validate: (value) => (value === "" ? "Enter an API key." : undefined),
      input,
      output,
      env: {},
    });

    await wait();
    await typeAndSubmit(input, ""); // empty -> validation error, should re-prompt
    await typeAndSubmit(input, "sk-secret");

    const result = await pending;
    assert.deepEqual(result, { status: "submitted", value: "sk-secret" });
    assert.match(out.text(), /Enter an API key\./);
  });
});
