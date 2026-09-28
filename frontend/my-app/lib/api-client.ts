/**
 * Single HTTP client for the SIGMA-FCEN REST API (SAD section 5.2).
 *
 * Every request goes through `apiRequest`, which resolves the base URL from
 * NEXT_PUBLIC_API_URL, sends and parses JSON, and turns failures into `ApiError`.
 */

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
};

export function getApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not set. Define it in the frontend environment.");
  }
  return baseUrl.replace(/\/+$/, "");
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

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const { detail } = body as { detail: unknown };
    if (typeof detail === "string") {
      return detail;
    }
  }
  return fallback;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with "/": received "${path}".`);
  }

  const { body, headers, ...init } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");
  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      credentials: "include",
      ...init,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError(0, "Network error: the API could not be reached.", cause);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const parsed = await parseBody(response);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      errorMessage(parsed, `Request failed with status ${response.status}.`),
      parsed,
    );
  }
  return parsed as T;
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

const NETWORK_ERROR_MESSAGE = "No pudimos conectar con el servidor. Intenta de nuevo.";
const GENERIC_ERROR_MESSAGE = "Algo salió mal. Intenta de nuevo.";

/** A message fit for the interface: the API's `detail` when it sent one. */
export function requestErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return GENERIC_ERROR_MESSAGE;
  }
  if (error.status === 0) {
    return NETWORK_ERROR_MESSAGE;
  }
  const body = error.body;
  if (typeof body === "object" && body !== null && "detail" in body) {
    return String((body as { detail: unknown }).detail);
  }
  return GENERIC_ERROR_MESSAGE;
}
