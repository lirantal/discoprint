import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { canPromptInteractively, promptPassword, promptText } from "./prompt.js";

function fakeTty(): PassThrough & { isTTY: boolean } {
  const stream = new PassThrough() as PassThrough & { isTTY: boolean };
  stream.isTTY = true;
  return stream;
}

/** A TTY-like stream that also supports setRawMode, so promptPassword takes its masked-echo path (rather than the unmasked askLine fallback used for the plain fakeTty()). */
function fakeRawTty(): PassThrough & { isTTY: boolean; isRaw: boolean; setRawMode: (mode: boolean) => void } {
  const stream = new PassThrough() as PassThrough & {
    isTTY: boolean;
    isRaw: boolean;
    setRawMode: (mode: boolean) => void;
  };
  stream.isTTY = true;
  stream.isRaw = false;
  stream.setRawMode = (mode: boolean) => {
    stream.isRaw = mode;
  };
  return stream;
}

function collect(output: PassThrough): { text: () => string } {
  let buffer = "";
  output.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
  });
  return { text: () => buffer };
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
    const input = fakeTty();
    const output = fakeTty();
    const out = collect(output);

    const pending = promptText({ title: "Which artist or band?", summaryLabel: "Artist", input, output, env: {} });
    input.write("Radiohead\n");
    const result = await pending;

    assert.deepEqual(result, { status: "submitted", value: "Radiohead" });
    assert.match(out.text(), /Which artist or band\?/);
    assert.match(out.text(), /Artist: Radiohead/);
  });

  await t.test("re-prompts on a validation error, then accepts a valid value", async () => {
    const input = fakeTty();
    const output = fakeTty();
    const out = collect(output);

    const pending = promptText({
      title: "Which artist or band?",
      summaryLabel: "Artist",
      validate: (value) => (value === "" ? "Enter an artist name." : undefined),
      input,
      output,
      env: {},
    });

    input.write("\n"); // empty -> validation error, should re-prompt
    await new Promise((resolve) => setTimeout(resolve, 10));
    input.write("Radiohead\n");

    const result = await pending;
    assert.deepEqual(result, { status: "submitted", value: "Radiohead" });
    assert.match(out.text(), /Enter an artist name\./);
  });

  await t.test("falls back to defaultValue on an empty answer", async () => {
    const input = fakeTty();
    const output = fakeTty();

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
    input.write("\n");

    const result = await pending;
    assert.deepEqual(result, { status: "submitted", value: "100" });
  });

  await t.test("printSummary: false suppresses the '<label>: <value>' echo line", async () => {
    const input = fakeTty();
    const output = fakeTty();
    const out = collect(output);

    const pending = promptText({
      title: "How many songs to classify?",
      summaryLabel: "Limit",
      printSummary: false,
      input,
      output,
      env: {},
    });
    input.write("5\n");
    const result = await pending;

    assert.deepEqual(result, { status: "submitted", value: "5" });
    assert.doesNotMatch(out.text(), /Limit: 5/);
  });

  await t.test("cancels when the input stream closes without an answer", async () => {
    const input = fakeTty();
    const output = fakeTty();

    const pending = promptText({ title: "Which artist or band?", summaryLabel: "Artist", input, output });
    input.end();

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
    input.write("sk-secret");
    input.write("\n");
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
    input.write("abc");
    input.write("\x7f"); // backspace (DEL)
    input.write("d\n");
    const result = await pending;

    assert.deepEqual(result, { status: "submitted", value: "abd" });
    // \b in a regex means "word boundary", not backspace, so match the raw byte directly.
    assert.match(out.text(), /\*{3}\x08 \x08\*/);
  });

  await t.test("cancels on Ctrl+C", async () => {
    const input = fakeRawTty();
    const output = fakeRawTty();

    const pending = promptPassword({ title: "API key?", summaryLabel: "TYPESAFE_API_KEY", input, output, env: {} });
    input.write("partial");
    input.write("\x03"); // Ctrl+C
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

    input.write("\n"); // empty -> validation error, should re-prompt
    await new Promise((resolve) => setTimeout(resolve, 10));
    input.write("sk-secret\n");

    const result = await pending;
    assert.deepEqual(result, { status: "submitted", value: "sk-secret" });
    assert.match(out.text(), /Enter an API key\./);
  });

  await t.test("falls back to an unmasked read when the input stream doesn't support raw mode", async () => {
    const input = fakeTty();
    const output = fakeTty();
    const out = collect(output);

    const pending = promptPassword({ title: "API key?", summaryLabel: "TYPESAFE_API_KEY", input, output, env: {} });
    input.write("sk-secret\n");
    const result = await pending;

    assert.deepEqual(result, { status: "submitted", value: "sk-secret" });
    assert.doesNotMatch(out.text(), /TYPESAFE_API_KEY: /);
  });
});
