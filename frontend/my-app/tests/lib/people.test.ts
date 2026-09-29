import { describe, expect, it } from "vitest";

import { displayName, initialsOf, primaryRole } from "@/lib/people";

describe("people helpers", () => {
  it("shows the full name, or the email when there is none", () => {
    expect(displayName({ first_name: "Ana", last_name: "Pérez", email: "a@unal.edu.co" })).toBe(
      "Ana Pérez",
    );
    expect(displayName({ first_name: " ", last_name: "", email: "a@unal.edu.co" })).toBe(
      "a@unal.edu.co",
    );
  });

  it("takes the initials of the first and last name, or of the email", () => {
    expect(initialsOf({ first_name: "ana", last_name: "Pérez", email: "x@unal.edu.co" })).toBe("AP");
    expect(initialsOf({ first_name: "Luis Carlos", last_name: "", email: "x@unal.edu.co" })).toBe(
      "LC",
    );
    expect(initialsOf({ first_name: "", last_name: "", email: "marta@unal.edu.co" })).toBe("M");
  });

  it("names the role with the widest reach as the primary one", () => {
    expect(primaryRole(["STUDENT", "ADMIN", "TEACHER"])).toBe("ADMIN");
    expect(primaryRole(["MONITOR", "STUDENT"])).toBe("MONITOR");
    expect(primaryRole([])).toBeNull();
  });
});
