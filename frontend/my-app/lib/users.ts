/**
 * User administration endpoints (FASE-01, RF-020, RF-021). Every one of them requires
 * the ADMIN role on the API side; the interface only hides what the API would refuse.
 */

import { apiRequest } from "@/lib/api-client";
import type { RoleCode } from "@/lib/auth";
import type { components } from "@/types/api";

export type AdminUser = components["schemas"]["AdminUser"];
export type UserPage = components["schemas"]["PaginatedAdminUserList"];
export type NewUser = components["schemas"]["UserCreate"];
export type UserChanges = components["schemas"]["PatchedUserUpdate"];
export type DeactivationResult = components["schemas"]["DeactivationResult"];

/** The API's DefaultPagination page size; the list is ordered by email. */
export const USERS_PAGE_SIZE = 20;

export function listUsers(page: number, signal?: AbortSignal): Promise<UserPage> {
  return apiRequest<UserPage>(`/users/?page=${page}`, { signal });
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
