import { afterEach, describe, expect, it, vi } from "vitest";

import { pinnedKey, readPinned, writePinned } from "@/features/catalog/pinned-subjects";

describe("pinned subjects storage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps one list per person", () => {
    writePinned("user-a", [3, 1]);
    writePinned("user-b", [7]);

    expect(readPinned("user-a")).toEqual([3, 1]);
    expect(readPinned("user-b")).toEqual([7]);
    expect(localStorage.getItem(pinnedKey("user-a"))).toBe("[3,1]");
  });

  it("reads nothing when the stored value is missing or malformed", () => {
    expect(readPinned("nobody")).toEqual([]);

    localStorage.setItem(pinnedKey("user-a"), "{not json");
    expect(readPinned("user-a")).toEqual([]);

    localStorage.setItem(pinnedKey("user-a"), JSON.stringify(["x", 2, -1, 2.5, 4]));
    expect(readPinned("user-a")).toEqual([2, 4]);
  });

  it("survives a browser that refuses storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    expect(readPinned("user-a")).toEqual([]);
    expect(() => writePinned("user-a", [1])).not.toThrow();
  });
});
