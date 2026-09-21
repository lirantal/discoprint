// Interactive text/password prompts built on Ink + @inkjs/ui, so the CLI's
// input widgets share the same rendering pipeline (and visual language) as
// the live classify dashboard (src/tui) instead of hand-rolled readline code.
import React, { useEffect, useState } from "react";
import { Box, render, Text, useApp, useInput } from "ink";
import { PasswordInput, TextInput } from "@inkjs/ui";
import { isCiEnvironment } from "./tty.js";

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

export interface PasswordPromptOptions {
  title: string;
  details?: readonly string[];
  summaryLabel: string;
  validate?: (value: string) => string | undefined;
  input?: PromptInput;
  output?: PromptOutput;
  env?: NodeJS.ProcessEnv;
}

interface PromptViewProps {
  kind: "text" | "password";
  title: string;
  details?: readonly string[];
  defaultValue?: string;
  validate?: (value: string) => string | undefined;
  onSettle: (result: TextPromptResult) => void;
}

function PromptView({ kind, title, details, defaultValue, validate, onSettle }: PromptViewProps): React.JSX.Element {
  const { exit } = useApp();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState(false);
  // What (if anything) stays visible in the input row once done: the final
  // value for a text prompt (matching the old behavior of leaving the typed
  // answer on screen), its masked form for a password, or nothing on cancel.
  const [settledDisplay, setSettledDisplay] = useState<string>();

  // Deferred rather than called straight from the input handler, so the
  // "done" state (which paints the closing rail and settledDisplay above)
  // actually commits before Ink tears the app down.
  useEffect(() => {
    if (done) exit();
  }, [done, exit]);

  useInput((input, key) => {
    if (done) return;
    if (key.escape || (key.ctrl && input === "c")) {
      setDone(true);
      onSettle({ status: "cancelled" });
    }
  });

  function handleSubmit(raw: string): void {
    if (done) return;

    const value = raw.trim() === "" && defaultValue !== undefined ? defaultValue : raw.trim();
    const validationError = validate?.(value);
    if (validationError !== undefined) {
      setError(validationError);
      setAttempt((n) => n + 1);
      return;
    }

    setDone(true);
    setSettledDisplay(kind === "password" ? "*".repeat(value.length) : value);
    onSettle({ status: "submitted", value });
  }

  return (
    <Box flexDirection="column">
      <Text>
        <Text color="cyan">◆</Text>
        {"  "}
        <Text bold>{title}</Text>
      </Text>
      {details?.map((detail) => (
        <Text key={detail}>
          <Text color="cyan">│</Text>
          {"  "}
          <Text dimColor>{detail}</Text>
        </Text>
      ))}
      <Box>
        <Text color="cyan">│</Text>
        <Text>{"  "}</Text>
        {done ? (
          settledDisplay !== undefined ? (
            <Text>{settledDisplay}</Text>
          ) : null
        ) : kind === "text" ? (
          <TextInput key={attempt} defaultValue={defaultValue} onSubmit={handleSubmit} />
        ) : (
          <PasswordInput key={attempt} onSubmit={handleSubmit} />
        )}
      </Box>
      {error !== undefined && !done && (
        <Text>
          <Text color="cyan">│</Text>
          {"  "}
          {error}
        </Text>
      )}
      {done && <Text color="cyan">└</Text>}
    </Box>
  );
}

interface RunPromptOptions {
  kind: "text" | "password";
  title: string;
  details?: readonly string[];
  defaultValue?: string;
  summaryLabel: string;
  printSummary: boolean;
  validate?: (value: string) => string | undefined;
  input: PromptInput;
  output: PromptOutput;
}

function runPrompt(options: RunPromptOptions): Promise<TextPromptResult> {
  return new Promise((resolve) => {
    let settled = false;

    const instance = render(
      <PromptView
        kind={options.kind}
        title={options.title}
        details={options.details}
        defaultValue={options.defaultValue}
        validate={options.validate}
        onSettle={settle}
      />,
      {
        // Cast: our public prompt API accepts any readable/writable stream (for
        // testing with plain PassThrough doubles), while Ink's types require the
        // fuller NodeJS.ReadStream/WriteStream shape it actually needs at runtime.
        stdin: options.input as NodeJS.ReadStream,
        stdout: options.output as NodeJS.WriteStream,
        exitOnCtrlC: false,
        patchConsole: false,
        interactive: true,
      },
    );

    function settle(result: TextPromptResult): void {
      if (settled) return;
      settled = true;

      void instance.waitUntilExit().then(() => {
        if (result.status === "submitted" && options.printSummary) {
          options.output.write(`${options.summaryLabel}: ${result.value}\n`);
        } else if (result.status === "cancelled") {
          options.output.write(`${options.summaryLabel}: canceled\n`);
        }
        resolve(result);
      });
    }

    // The Ink app has no way to know the input stream closed out from under it
    // (e.g. piped stdin ending) — settle as cancelled ourselves so callers don't
    // hang forever waiting for a keystroke that will never arrive.
    options.input.once("close", () => {
      if (settled) return;
      settle({ status: "cancelled" });
      instance.unmount();
    });
  });
}

export async function promptText(options: TextPromptOptions): Promise<TextPromptResult> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const env = options.env ?? process.env;

  if (!canPromptInteractively(input, output, env)) {
    return { status: "cancelled" };
  }

  return runPrompt({
    kind: "text",
    title: options.title,
    details: options.details,
    defaultValue: options.defaultValue,
    summaryLabel: options.summaryLabel,
    printSummary: options.printSummary ?? true,
    validate: options.validate,
    input,
    output,
  });
}

/** Like {@link promptText}, but masks each typed character and never echoes the submitted value. */
export async function promptPassword(options: PasswordPromptOptions): Promise<TextPromptResult> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const env = options.env ?? process.env;

  if (!canPromptInteractively(input, output, env)) {
    return { status: "cancelled" };
  }

  return runPrompt({
    kind: "password",
    title: options.title,
    details: options.details,
    summaryLabel: options.summaryLabel,
    printSummary: false,
    validate: options.validate,
    input,
    output,
  });
}
