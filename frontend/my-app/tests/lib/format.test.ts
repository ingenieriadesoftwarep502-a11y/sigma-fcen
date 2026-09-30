import { describe, expect, it } from "vitest";

import { formatDate, formatDay, formatRelativeTime } from "@/lib/format";

describe("format helpers", () => {
  it("shows a calendar date as that same day, whatever the time zone", () => {
    expect(formatDay("2026-08-01")).toMatch(/^1 ago\.? 2026$/);
    expect(formatDay("2026-12-31")).toMatch(/^31 dic\.? 2026$/);
  });

  const now = new Date("2026-09-29T15:00:00Z");

  it("formats a registration date in Colombian Spanish", () => {
    expect(formatDate("2026-02-01T10:00:00Z")).toMatch(/^1 feb\.? 2026$/);
  });

  it("says how long ago something happened", () => {
    expect(formatRelativeTime("2026-09-29T14:59:40Z", now)).toBe("hace un momento");
    expect(formatRelativeTime("2026-09-29T14:55:00Z", now)).toBe("hace 5 minutos");
    expect(formatRelativeTime("2026-09-29T12:00:00Z", now)).toBe("hace 3 horas");
    expect(formatRelativeTime("2026-09-28T12:00:00Z", now)).toBe("ayer");
    expect(formatRelativeTime("2026-09-19T12:00:00Z", now)).toBe("hace 10 días");
    expect(formatRelativeTime("2026-06-01T12:00:00Z", now)).toBe("hace 4 meses");
  });
});
