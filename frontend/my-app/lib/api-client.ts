/**
 * Single HTTP client for the SIGMA-FCEN REST API (SAD section 5.2).
 *
 * Every request goes through `apiRequest`, which resolves the base URL from
 * NEXT_PUBLIC_API_URL, sends and parses JSON, and turns failures into `ApiError`.
 *
 * Session model (ADR-007): the JWT lives in HttpOnly cookies that scripts never see.
 * Unsafe requests carry a CSRF token that the API hands out in a response body and this
 * module keeps in memory only, so it works even when the API runs on another host.
 */

import type { components } from "@/types/api";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export type ApiRequestOptions = Omit<RequestInit, "body"> & {
  /** Plain value serialized as JSON. */
  body?: unknown;
  /** Milliseconds for the whole operation, CSRF and session renewal included (default 15 s). */
  timeoutMs?: number;
};

type Exchange = Omit<ApiRequestOptions, "timeoutMs" | "signal">;

export const DEFAULT_TIMEOUT_MS = 15_000;

const CSRF_PATH = "/auth/csrf/";
const REFRESH_PATH = "/auth/refresh/";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/**
 * Endpoints whose 401 means bad credentials or a dead session, never an expired
 * access token. Logout is included so a failed logout cannot revive the session.
 */
const NO_REFRESH_PATHS = new Set(["/auth/login/", "/auth/register/", REFRESH_PATH, "/auth/logout/"]);

const NETWORK_ERROR_MESSAGE = "No pudimos conectar con el servidor. Intenta de nuevo.";
const TIMEOUT_ERROR_MESSAGE = "El servidor tardó demasiado en responder. Intenta de nuevo.";
const THROTTLED_MESSAGE = "Demasiados intentos. Espera un momento e intenta de nuevo.";
const GENERIC_ERROR_MESSAGE = "Algo salió mal. Intenta de nuevo.";

export function getApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not set. Define it in the frontend environment.");
  }
  return baseUrl.replace(/\/+$/, "");
}

function detailOf(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const { detail } = body as { detail: unknown };
    if (typeof detail === "string") {
      return detail;
    }
  }
  return null;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** One HTTP round trip. Network failures and aborts escape as they are. */
async function exchange<T>(
  path: string,
  { body, headers, ...init }: Exchange,
  signal: AbortSignal,
  csrfToken: string | null = null,
): Promise<T> {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");
  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }
  if (csrfToken) {
    requestHeaders.set("X-CSRFToken", csrfToken);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    // The session lives in HttpOnly cookies (ADR-007): they must always travel.
    credentials: "include",
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      detailOf(parsed) ?? `Request failed with status ${response.status}.`,
      parsed,
    );
  }
  return parsed as T;
}

/** Waits for a shared promise, but lets this caller give up when its own signal aborts. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** Runs work shared by concurrent callers under its own deadline, independent of any caller. */
function shared<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  return work(controller.signal).finally(() => clearTimeout(timer));
}

let csrfToken: string | null = null;
let csrfInFlight: Promise<string | null> | null = null;

/** Drops the CSRF token; the API rotates it on login, so the next unsafe request asks again. */
export function forgetCsrfToken(): void {
  csrfToken = null;
}

/** The CSRF token, fetched once and shared by concurrent callers. */
function csrfTokenFor(signal: AbortSignal): Promise<string | null> {
  if (csrfToken) {
    return Promise.resolve(csrfToken);
  }
  csrfInFlight ??= shared((own) =>
    exchange<components["schemas"]["CsrfToken"]>(CSRF_PATH, {}, own),
  )
    // A failure is left to the unsafe request itself, which the API then rejects clearly.
    .then(
      ({ csrfToken: token }) => (csrfToken = token),
      () => null,
    )
    .finally(() => {
      csrfInFlight = null;
    });
  return untilAborted(csrfInFlight, signal);
}

async function perform<T>(path: string, request: Exchange, signal: AbortSignal): Promise<T> {
  const method = (request.method ?? "GET").toUpperCase();
  const token = SAFE_METHODS.has(method) ? null : await csrfTokenFor(signal);
  return exchange<T>(path, request, signal, token);
}

let refreshInFlight: Promise<boolean> | null = null;

/** Renews the access cookie; concurrent callers share a single refresh request. */
function refreshSession(signal: AbortSignal): Promise<boolean> {
  refreshInFlight ??= shared((own) => perform(REFRESH_PATH, { method: "POST" }, own))
    .then(
      () => true,
      () => false,
    )
    .finally(() => {
      refreshInFlight = null;
    });
  return untilAborted(refreshInFlight, signal);
}

function isCsrfRejection(error: ApiError): boolean {
  return error.status === 403 && (detailOf(error.body)?.startsWith("CSRF Failed") ?? false);
}

/** One attempt, plus at most one retry per recoverable failure: stale CSRF and expired access. */
async function withRecovery<T>(path: string, request: Exchange, signal: AbortSignal): Promise<T> {
  let renewedCsrf = false;
  let renewedSession = false;
  for (;;) {
    try {
      return await perform<T>(path, request, signal);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error;
      }
      if (!renewedCsrf && isCsrfRejection(error)) {
        // Another tab signed in and rotated the token: ask for a new one and try again.
        renewedCsrf = true;
        forgetCsrfToken();
        continue;
      }
      if (!renewedSession && error.status === 401 && !NO_REFRESH_PATHS.has(path)) {
        renewedSession = true;
        if (await refreshSession(signal)) {
          continue;
        }
      }
      throw error;
    }
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with "/": received "${path}".`);
  }
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...request } = options;

  const deadline = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    deadline.abort();
  }, timeoutMs);
  const forwardAbort = () => deadline.abort(callerSignal?.reason);
  if (callerSignal?.aborted) {
    forwardAbort();
  }
  callerSignal?.addEventListener("abort", forwardAbort);

  try {
    return await withRecovery<T>(path, request, deadline.signal);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (timedOut) {
      throw new ApiError(0, `Timeout: the API did not respond within ${timeoutMs} ms.`, {
        detail: TIMEOUT_ERROR_MESSAGE,
      });
    }
    throw new ApiError(0, "Network error: the API could not be reached.", error);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
}

/** Per-field messages of a DRF validation error (`{"field": ["message", ...]}`). */
export function fieldErrors(error: unknown): Record<string, string[]> {
  if (!(error instanceof ApiError) || typeof error.body !== "object" || error.body === null) {
    return {};
  }
  const errors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(error.body)) {
    if (Array.isArray(messages)) {
      errors[field] = messages.map(String);
    }
  }
  return errors;
}

/**
 * What a form shows for a failed request: each field's own messages next to it, and one
 * general message for the rest (`non_field_errors`, unknown fields, or a non-validation
 * failure), so no message is silently dropped.
 */
export function formErrors<F extends string>(
  error: unknown,
  fields: readonly F[],
): { byField: Partial<Record<F, string[]>>; message: string | null } {
  const byField: Partial<Record<F, string[]>> = {};
  const other: string[] = [];
  for (const [field, messages] of Object.entries(fieldErrors(error))) {
    if ((fields as readonly string[]).includes(field)) {
      byField[field as F] = messages;
    } else {
      other.push(...messages);
    }
  }
  if (other.length > 0) {
    return { byField, message: other.join(" ") };
  }
  const hasFieldErrors = Object.keys(byField).length > 0;
  return { byField, message: hasFieldErrors ? null : requestErrorMessage(error) };
}

/** A message fit for the interface; technical details of the transport never reach it. */
export function requestErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return GENERIC_ERROR_MESSAGE;
  }
  if (error.status === 0) {
    return detailOf(error.body) ?? NETWORK_ERROR_MESSAGE;
  }
  if (error.status === 429) {
    return THROTTLED_MESSAGE;
  }
  if (isCsrfRejection(error)) {
    return GENERIC_ERROR_MESSAGE;
  }
  return detailOf(error.body) ?? GENERIC_ERROR_MESSAGE;
}
