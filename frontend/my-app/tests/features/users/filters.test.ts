import { describe, expect, it } from "vitest";

import { filtersFromParams, hasFilters, paramsFromFilters } from "@/features/users/filters";
import { NO_FILTERS } from "@/lib/users";

describe("user list filters in the URL", () => {
  it("reads the filters from the query string", () => {
    expect(filtersFromParams(new URLSearchParams("q=luis&rol=TEACHER&estado=inactivas"))).toEqual({
      search: "luis",
      role: "TEACHER",
      isActive: false,
    });
    expect(filtersFromParams(new URLSearchParams("estado=activas"))).toEqual({
      ...NO_FILTERS,
      isActive: true,
    });
  });

  it("ignores values it does not know", () => {
    expect(filtersFromParams(new URLSearchParams("rol=ROOT&estado=todas"))).toEqual(NO_FILTERS);
  });

  it("writes only the filters in use", () => {
    expect(paramsFromFilters({ search: " ana ", role: "ADMIN", isActive: true }).toString()).toBe(
      "q=ana&rol=ADMIN&estado=activas",
    );
    expect(paramsFromFilters(NO_FILTERS).toString()).toBe("");
  });

  it("knows whether any filter is in use", () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, search: "  " })).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, isActive: false })).toBe(true);
  });
});
