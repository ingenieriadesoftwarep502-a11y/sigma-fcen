import { describe, expect, it } from "vitest";

import {
  capacityOf,
  GROUP_CAPACITY_MESSAGE,
  sessionErrors,
  type SessionValues,
} from "@/features/availability/components/session-fields";

const BASE: SessionValues = {
  modality: "IN_PERSON",
  location: "Bloque 14-203",
  group: false,
  capacity: "",
};

function group(capacity: string): SessionValues {
  return { ...BASE, group: true, capacity };
}

describe("capacityOf", () => {
  it("gives an individual session one seat, whatever was typed", () => {
    expect(capacityOf(BASE)).toBe(1);
    expect(capacityOf({ ...BASE, capacity: "abc" })).toBe(1);
  });

  it.each([
    ["2", 2],
    [" 6 ", 6],
    ["32767", 32767],
  ])("accepts %j seats for a group session", (typed, seats) => {
    expect(capacityOf(group(typed))).toBe(seats);
  });

  it.each(["1", "0", "32768", "", "abc", "2.5", "-3", "1e3"])(
    "rejects %j seats for a group session",
    (typed) => {
      expect(capacityOf(group(typed))).toBeNull();
    },
  );
});

describe("sessionErrors", () => {
  it("accepts a complete individual session", () => {
    expect(sessionErrors(BASE)).toEqual({});
  });

  it("asks for the location and valid group seats", () => {
    expect(sessionErrors({ ...group("1"), location: "  " })).toEqual({
      location: ["Indica el aula o el enlace de la sesión."],
      capacity: [GROUP_CAPACITY_MESSAGE],
    });
  });

  it("accepts the group seat boundaries", () => {
    expect(sessionErrors(group("2"))).toEqual({});
    expect(sessionErrors(group("32767"))).toEqual({});
    expect(sessionErrors(group("32768"))).toEqual({ capacity: [GROUP_CAPACITY_MESSAGE] });
  });
});
