/**
 * User administration endpoints (FASE-01, RF-020, RF-021). Every one of them requires
 * the ADMIN role on the API side; the interface only hides what the API would refuse.
 */

import { apiDownload, apiRequest, type DownloadedFile } from "@/lib/api-client";
import type { RoleCode } from "@/lib/auth";
import type { components } from "@/types/api";

export type AdminUser = components["schemas"]["AdminUser"];
export type UserPage = components["schemas"]["PaginatedAdminUserList"];
export type NewUser = components["schemas"]["UserCreate"];
export type UserChanges = components["schemas"]["PatchedUserUpdate"];
export type DeactivationResult = components["schemas"]["DeactivationResult"];
export type UserSummary = components["schemas"]["UserSummary"];
export type AuditEntry = components["schemas"]["AuditEntry"];

/** What the list and the export are narrowed to; `null` means "any". */
export type UserFilters = {
  /** Matches email, first name, last name or full name, ignoring case. */
  search: string;
  role: RoleCode | null;
  isActive: boolean | null;
};

export const NO_FILTERS: UserFilters = { search: "", role: null, isActive: null };

/** The API's DefaultPagination page size; the list is ordered by email. */
export const USERS_PAGE_SIZE = 20;

/** Longer than the default: the workbook is built from every matching account. */
const EXPORT_TIMEOUT_MS = 60_000;
const EXPORT_FALLBACK_NAME = "usuarios.xlsx";

/** The API's filter parameters for the filters in use; empty ones are left out. */
function filterParams({ search, role, isActive }: UserFilters): URLSearchParams {
  const params = new URLSearchParams();
  const term = search.trim();
  if (term) params.set("search", term);
  if (role) params.set("role", role);
  if (isActive !== null) params.set("is_active", String(isActive));
  return params;
}

export function listUsers(
  page: number,
  filters: UserFilters,
  signal?: AbortSignal,
): Promise<UserPage> {
  const params = new URLSearchParams({ page: String(page) });
  filterParams(filters).forEach((value, key) => params.set(key, value));
  return apiRequest<UserPage>(`/users/?${params}`, { signal });
}

/** Headline numbers and the latest audit entries for the admin dashboard. */
export function getUserSummary(signal?: AbortSignal): Promise<UserSummary> {
  return apiRequest<UserSummary>("/users/summary/", { signal });
}

/** Every account matching the filters as an .xlsx workbook, without pagination. */
export async function exportUsers(
  filters: UserFilters,
): Promise<DownloadedFile & { filename: string }> {
  const query = filterParams(filters).toString();
  const file = await apiDownload(`/users/export/${query ? `?${query}` : ""}`, {
    timeoutMs: EXPORT_TIMEOUT_MS,
  });
  return { blob: file.blob, filename: file.filename ?? EXPORT_FALLBACK_NAME };
}

/** Creates an active account with the chosen roles (CA-HU11-1). */
export function createUser(data: NewUser): Promise<AdminUser> {
  return apiRequest<AdminUser>("/users/", { method: "POST", body: data });
}

/** Edits identity fields or reactivates; deactivation has its own endpoint. */
export function updateUser(id: string, changes: UserChanges): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/users/${id}/`, { method: "PATCH", body: changes });
}

/** Replaces every role of the account with `roles`. */
export function setUserRoles(id: string, roles: RoleCode[]): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/users/${id}/roles/`, { method: "POST", body: { roles } });
}

/** Without `confirm` it only reports the impact; with it the account is blocked (CA-HU11-3). */
export function deactivateUser(
  id: string,
  { confirm }: { confirm: boolean },
): Promise<DeactivationResult> {
  return apiRequest<DeactivationResult>(`/users/${id}/deactivate/`, {
    method: "POST",
    body: { confirm },
  });
}
