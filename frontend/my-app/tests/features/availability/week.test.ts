import { describe, expect, it } from "vitest";

import {
  addDays,
  clockLabel,
  minutesOfDay,
  mondayOf,
  todayInBogota,
  weekDates,
  weekRangeLabel,
} from "@/features/availability/week";

describe("week arithmetic on Bogotá dates", () => {
  it("finds the Monday of any day, Sunday included", () => {
    expect(mondayOf("2026-10-19")).toBe("2026-10-19");
    expect(mondayOf("2026-10-21")).toBe("2026-10-19");
    expect(mondayOf("2026-10-25")).toBe("2026-10-19");
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
  });

  it("lists the seven days of a week across a month change", () => {
    expect(weekDates("2026-10-26")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });

  it("reads days and times in Bogotá, not in the browser's zone", () => {
    // 03:30 UTC on the 20th is still the 19th, 22:30, in Bogotá.
    expect(todayInBogota(new Date("2026-10-20T03:30:00Z"))).toBe("2026-10-19");
    expect(minutesOfDay("2026-10-20T15:00:00Z")).toBe(600);
    expect(clockLabel(570)).toBe("09:30");
  });

  it("names a week by its first and last day", () => {
    expect(weekRangeLabel("2026-10-19")).toBe("19 – 25 de octubre");
    expect(weekRangeLabel("2026-10-26")).toMatch(/^26 oct – 1 nov$/);
  });
});
