import {
  APIConnectionError,
  APIError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
  TypeSafeError,
} from "@typesafe-ai/sdk";

/**
 * A predictable, already-understood failure (bad input, an unreachable
 * service, a known API rejection) whose `message` is meant to be shown to
 * the user directly, without a stack trace.
 */
export class KnownError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "KnownError";
  }
}

export interface ErrorDescription {
  /** Human-readable explanation, safe to print on its own. */
  message: string;
  /** False for anything we couldn't map to a known cause — print the stack trace too. */
  known: boolean;
}

function isNetworkFailure(err: unknown): err is TypeError {
  return err instanceof TypeError && /fetch failed/i.test(err.message);
}

/** Maps a thrown value to a clean, actionable message where the cause is predictable. */
export function describeError(err: unknown): ErrorDescription {
  if (err instanceof KnownError) {
    return { message: err.message, known: true };
  }

  if (err instanceof AuthenticationError) {
    return {
      message: `${err.message}\nCheck TYPESAFE_API_KEY in your local .env (see README) — get a key at https://console.typesafe.ai/keys.`,
      known: true,
    };
  }

  if (err instanceof RateLimitError) {
    const retry = err.retryAfterMs !== undefined ? ` Retry in about ${Math.ceil(err.retryAfterMs / 1000)}s.` : "";
    return {
      message: `${err.message}${retry}\nTry again shortly, or pass --limit to classify fewer songs per run.`,
      known: true,
    };
  }

  if (err instanceof PermissionDeniedError) {
    return { message: `${err.message}\nYour TypeSafe API key doesn't have access for this request.`, known: true };
  }

  if (err instanceof APIConnectionError) {
    return {
      message: `Could not reach the TypeSafe API (api.typesafe.ai). Check your internet connection.\n${err.message}`,
      known: true,
    };
  }

  if (err instanceof APIError) {
    return { message: `TypeSafe API error: ${err.message}`, known: true };
  }

  if (err instanceof TypeSafeError) {
    return { message: `TypeSafe SDK error: ${err.message}`, known: true };
  }

  if (isNetworkFailure(err)) {
    return { message: `Network request failed: ${err.message}\nCheck your internet connection.`, known: true };
  }

  return { message: err instanceof Error ? err.message : String(err), known: false };
}
