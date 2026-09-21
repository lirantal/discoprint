// A small text-prompt module in the look & feel of lirantal/boxdown's
// interactive-prompts.ts (same author, Apache-2.0) — trimmed down to just the
// line-based text prompt, since we only need open text input here (no arrow-key
// select/multi-select, so no raw-mode terminal handling is needed).
import { createInterface } from "node:readline";
import { isCiEnvironment } from "./tty.js";

const ansi = {
  bold: "[1m",
  cyan: "[36m",
  dim: "[2m",
  reset: "[0m",
} as const;

type CliColor = keyof typeof ansi;

function color(value: string, colorName: CliColor): string {
  return `${ansi[colorName]}${value}${ansi.reset}`;
}

function maybeColor(value: string, colorName: CliColor, enabled: boolean): string {
  return enabled ? color(value, colorName) : value;
}

function promptRail(enabled = true): string {
  return maybeColor("│", "cyan", enabled);
}

function formatPromptTitle(title: string, enabled = true): string {
  return `${maybeColor("◆", "cyan", enabled)}  ${maybeColor(title, "bold", enabled)}`;
}

function formatPromptEnd(enabled = true): string {
  return maybeColor("└", "cyan", enabled);
}

function formatPromptDetailLine(detail: string, enabled = true): string {
  return `${promptRail(enabled)}  ${maybeColor(detail, "dim", enabled)}`;
}

type PromptInput = NodeJS.ReadableStream & { isTTY?: boolean };
type PromptOutput = NodeJS.WritableStream & { isTTY?: boolean };

export function canPromptInteractively(
  input: PromptInput = process.stdin,
  output: PromptOutput = process.stdout,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return !isCiEnvironment(env) && input.isTTY === true && output.isTTY === true;
}

export type TextPromptResult = { status: "submitted"; value: string } | { status: "cancelled" };

export interface TextPromptOptions {
  title: string;
  details?: readonly string[];
  defaultValue?: string;
  summaryLabel: string;
  /** Print "<summaryLabel>: <value>" after a submitted answer. Default true; set false when the typed value is already visible above (e.g. echoed back by the terminal) and repeating it adds nothing. */
  printSummary?: boolean;
  validate?: (value: string) => string | undefined;
  input?: PromptInput;
  output?: PromptOutput;
  env?: NodeJS.ProcessEnv;
}

// Buffers stray "line" events that arrive after a readline interface has
// already closed (e.g. a double Enter press), so the next prompt on the same
// input stream doesn't silently skip itself by consuming a leftover answer.
const bufferedLineAnswers = new WeakMap<PromptInput, string[]>();

function askLine(input: PromptInput, output: PromptOutput, question: string): Promise<string | undefined> {
  const buffered = bufferedLineAnswers.get(input);
  const answer = buffered?.shift();
  if (answer !== undefined) {
    output.write(question);
    return Promise.resolve(answer);
  }

  const rl = createInterface({ input: input as NodeJS.ReadableStream, output, terminal: false });

  return new Promise((resolve) => {
    let settled = false;

    function settle(value: string | undefined): void {
      if (settled) return;
      settled = true;
      rl.close();
      resolve(value);
    }

    rl.once("close", () => settle(undefined));

    output.write(question);
    rl.on("line", (line) => {
      if (settled) {
        const answers = bufferedLineAnswers.get(input) ?? [];
        answers.push(line);
        bufferedLineAnswers.set(input, answers);
        return;
      }
      settle(line);
    });
  });
}

type RawModeInput = PromptInput & { setRawMode?: (mode: boolean) => void; isRaw?: boolean };

// Masks each typed character as "*" instead of the terminal's own echo, for
// secret input (e.g. an API key). Requires raw mode, so it only masks on a
// real TTY input stream; falls back to an unmasked line read otherwise (e.g.
// the PassThrough test doubles in prompt.test.ts, which have no TTY driver
// to disable echo on in the first place).
function readMaskedLine(input: PromptInput, output: PromptOutput, prompt: string): Promise<string | undefined> {
  const rawInput = input as RawModeInput;
  if (typeof rawInput.setRawMode !== "function") {
    return askLine(input, output, prompt);
  }
  const setRawMode = rawInput.setRawMode;

  return new Promise((resolve) => {
    let buffer = "";
    let settled = false;
    const wasRaw = rawInput.isRaw ?? false;

    function settle(value: string | undefined): void {
      if (settled) return;
      settled = true;
      input.removeListener("data", onData);
      setRawMode(wasRaw);
      input.pause();
      resolve(value);
    }

    function onData(chunk: string): void {
      for (const char of chunk) {
        const code = char.charCodeAt(0);

        if (char === "\r" || char === "\n") {
          output.write("\n");
          settle(buffer);
          return;
        }
        if (code === 3) {
          // Ctrl+C
          output.write("\n");
          settle(undefined);
          return;
        }
        if (code === 127 || char === "\b") {
          // Backspace (DEL)
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            output.write("\b \b");
          }
          continue;
        }
        if (code === 4 && buffer.length === 0) {
          // Ctrl+D on an empty line
          output.write("\n");
          settle(undefined);
          return;
        }
        if (code >= 32) {
          buffer += char;
          output.write("*");
        }
      }
    }

    output.write(prompt);
    setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    input.on("data", onData);
  });
}

export interface PasswordPromptOptions {
  title: string;
  details?: readonly string[];
  summaryLabel: string;
  validate?: (value: string) => string | undefined;
  input?: PromptInput;
  output?: PromptOutput;
  env?: NodeJS.ProcessEnv;
}

/** Like {@link promptText}, but masks each typed character and never echoes the submitted value. */
export async function promptPassword(options: PasswordPromptOptions): Promise<TextPromptResult> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const env = options.env ?? process.env;

  if (!canPromptInteractively(input, output, env)) {
    return { status: "cancelled" };
  }

  output.write(`${formatPromptTitle(options.title)}\n`);
  for (const detail of options.details ?? []) {
    output.write(`${formatPromptDetailLine(detail)}\n`);
  }

  for (;;) {
    const value = await readMaskedLine(input, output, `${promptRail()}  `);

    if (value === undefined) {
      output.write(`${formatPromptEnd()}\n${options.summaryLabel}: canceled\n`);
      return { status: "cancelled" };
    }

    const error = options.validate?.(value);
    if (error === undefined) {
      output.write(`${formatPromptEnd()}\n`);
      return { status: "submitted", value };
    }

    output.write(`${promptRail()}  ${error}\n`);
  }
}

export async function promptText(options: TextPromptOptions): Promise<TextPromptResult> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const env = options.env ?? process.env;

  if (!canPromptInteractively(input, output, env)) {
    return { status: "cancelled" };
  }

  output.write(`${formatPromptTitle(options.title)}\n`);
  for (const detail of options.details ?? []) {
    output.write(`${formatPromptDetailLine(detail)}\n`);
  }

  for (;;) {
    const defaultText = options.defaultValue === undefined ? "" : color(` (${options.defaultValue})`, "dim");
    const answer = await askLine(input, output, `${promptRail()}  ${defaultText} `);

    if (answer === undefined) {
      output.write(`${formatPromptEnd()}\n${options.summaryLabel}: canceled\n`);
      return { status: "cancelled" };
    }

    const value = answer.trim() === "" && options.defaultValue !== undefined ? options.defaultValue : answer.trim();
    const error = options.validate?.(value);

    if (error === undefined) {
      output.write(`${formatPromptEnd()}\n`);
      if (options.printSummary ?? true) {
        output.write(`${options.summaryLabel}: ${value}\n`);
      }
      return { status: "submitted", value };
    }

    output.write(`${promptRail()}  ${error}\n`);
  }
}
