/**
 * Identity endpoints (FASE-01). Tokens live in HttpOnly cookies set by the API
 * (ADR-007), so this module never sees or stores them.
 *
 * Types come from the generated OpenAPI contract (SAD 5.3); run `npm run gen:api`
 * after the backend schema changes.
 */

import { ApiError, apiRequest, forgetCsrfToken } from "@/lib/api-client";
import type { components } from "@/types/api";

export type User = components["schemas"]["User"];
export type RoleCode = components["schemas"]["RolesEnum"];
export type RegisterData = components["schemas"]["Register"];
type Credentials = components["schemas"]["Login"];

export const INSTITUTIONAL_EMAIL_DOMAIN = "unal.edu.co";

/** Where a signed-in person lands when nothing else was requested. */
export const HOME_PATH = "/inicio";
export const LOGIN_PATH = "/login";
/** User administration, for the ADMIN role only (T-01.16). */
export const USERS_ADMIN_PATH = "/admin/usuarios";
/** User administration with the create form already open. */
export const NEW_USER_PATH = `${USERS_ADMIN_PATH}?nuevo=1`;
/** The subject catalog as students browse it (FASE-02). */
export const SUBJECTS_PATH = "/asignaturas";
/** A teacher's own courses and their monitors (T-02.8). */
export const MY_COURSES_PATH = "/mis-cursos";
/** A monitor's own assigned subjects and their teachers (RN-009.1). */
export const MY_MONITORING_PATH = "/mis-monitorias";
/** Catalog administration, for the ADMIN role only (FASE-02). */
export const CATALOG_ADMIN_PATH = "/admin/catalogo";

/** Every role, in the order the interface lists them, with its Spanish label. */
export const ROLE_CODES: readonly RoleCode[] = ["STUDENT", "MONITOR", "TEACHER", "ADMIN"];
export const ROLE_LABELS: Record<RoleCode, string> = {
  STUDENT: "Estudiante",
  MONITOR: "Monitor",
  TEACHER: "Docente",
  ADMIN: "Administrador",
};

/** RN-001.2: mirrors the server rule so the form can warn before sending. */
export function isInstitutionalEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  return at > 0 && email.slice(at + 1).toLowerCase() === INSTITUTIONAL_EMAIL_DOMAIN;
}

export function hasAnyRole(user: User, roles: readonly RoleCode[]): boolean {
  return user.roles.some((role) => roles.includes(role));
}

/**
 * The `next` query value only when it is a path inside this app. Anything else, such as
 * `https://evil.com` or `//evil.com`, would turn the login page into an open redirect.
 */
export function safeRedirectPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) {
    return HOME_PATH;
  }
  if (next.includes("\\")) {
    return HOME_PATH;
  }
  return next;
}

export async function login(email: string, password: string): Promise<User> {
  const credentials: Credentials = { email, password };
  const user = await apiRequest<User>("/auth/login/", { method: "POST", body: credentials });
  // The API rotated the CSRF secret when the session began.
  forgetCsrfToken();
  return user;
}

export function register(data: RegisterData): Promise<User> {
  return apiRequest<User>("/auth/register/", { method: "POST", body: data });
}

/** Revokes the refresh token and clears the session cookies on the API side. */
export async function logout(): Promise<void> {
  try {
    await apiRequest<void>("/auth/logout/", { method: "POST" });
  } finally {
    forgetCsrfToken();
  }
}

/** The signed-in user, or null when there is no valid session. Other failures propagate. */
export async function getCurrentUser(signal?: AbortSignal): Promise<User | null> {
  try {
    return await apiRequest<User>("/users/me/", { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}
