/**
 * Identity endpoints (FASE-01). Tokens live in HttpOnly cookies set by the API
 * (ADR-007), so this module never sees or stores them.
 */

import { apiRequest } from "@/lib/api-client";

export type RoleCode = "STUDENT" | "MONITOR" | "TEACHER" | "ADMIN";

export type User = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: RoleCode[];
};

export type RegisterData = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
};

export const INSTITUTIONAL_EMAIL_DOMAIN = "unal.edu.co";

/** RN-001.2: mirrors the server rule so the form can warn before sending. */
export function isInstitutionalEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  return at > 0 && email.slice(at + 1).toLowerCase() === INSTITUTIONAL_EMAIL_DOMAIN;
}

export function login(email: string, password: string): Promise<User> {
  return apiRequest<User>("/auth/login/", { method: "POST", body: { email, password } });
}

export function register(data: RegisterData): Promise<User> {
  return apiRequest<User>("/auth/register/", { method: "POST", body: data });
}

/** Revokes the refresh token and clears the session cookies on the API side. */
export function logout(): Promise<void> {
  return apiRequest<void>("/auth/logout/", { method: "POST" });
}
