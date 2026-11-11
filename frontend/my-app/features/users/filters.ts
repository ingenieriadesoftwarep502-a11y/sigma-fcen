/**
 * The user list filters as URL query parameters, so a filtered view survives a reload
 * and can be shared. Parameter names and values are Spanish, like the rest of the URL.
 */

import { ROLE_CODES, type RoleCode } from "@/lib/auth";
import { NO_FILTERS, type UserFilters } from "@/lib/users";

export const STATUS_VALUES = { activas: true, inactivas: false } as const;
export type StatusValue = keyof typeof STATUS_VALUES;

function isRole(value: string | null): value is RoleCode {
  return value !== null && (ROLE_CODES as readonly string[]).includes(value);
}

export function statusValueOf(isActive: boolean | null): StatusValue | "" {
  if (isActive === null) return "";
  return isActive ? "activas" : "inactivas";
}

export function isActiveOf(value: string): boolean | null {
  return value in STATUS_VALUES ? STATUS_VALUES[value as StatusValue] : null;
}

export function filtersFromParams(params: Pick<URLSearchParams, "get">): UserFilters {
  const role = params.get("rol");
  return {
    search: params.get("q") ?? NO_FILTERS.search,
    role: isRole(role) ? role : null,
    isActive: isActiveOf(params.get("estado") ?? ""),
  };
}

export function paramsFromFilters({ search, role, isActive }: UserFilters): URLSearchParams {
  const params = new URLSearchParams();
  const term = search.trim();
  if (term) params.set("q", term);
  if (role) params.set("rol", role);
  const status = statusValueOf(isActive);
  if (status) params.set("estado", status);
  return params;
}

export function hasFilters({ search, role, isActive }: UserFilters): boolean {
  return search.trim() !== "" || role !== null || isActive !== null;
}
