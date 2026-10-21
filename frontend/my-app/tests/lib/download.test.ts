import { afterEach, describe, expect, it, vi } from "vitest";

import { saveFile } from "@/lib/download";

describe("saveFile", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("hands the blob to the browser as a download with the given name", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:http://app.test/1");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    const blob = new Blob(["x"]);
    saveFile(blob, "usuarios.xlsx");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe("usuarios.xlsx");
    expect(clicked[0]!.href).toBe("blob:http://app.test/1");
    expect(clicked[0]!.isConnected).toBe(false);
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:http://app.test/1");
  });
});
