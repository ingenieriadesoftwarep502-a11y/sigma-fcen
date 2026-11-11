import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { usePagedList } from "@/lib/use-paged-list";

type Filters = { search: string };
const same = (a: Filters, b: Filters) => a.search === b.search;

describe("useDebouncedValue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("follows the value only after it stops changing", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: "a" },
    });
    rerender({ value: "ab" });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: "abc" });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("a");

    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("abc");
  });
});

describe("usePagedList", () => {
  it("loads the first page, then another page, then new filters from page 1", async () => {
    const load = vi.fn((page: number, filters: Filters) =>
      Promise.resolve({ page, search: filters.search }),
    );
    const { result } = renderHook(() => usePagedList(load, { search: "" }, same));

    await waitFor(() => expect(result.current.data).toEqual({ page: 1, search: "" }));
    expect(result.current.loading).toBe(false);

    act(() => result.current.goTo(3));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual({ page: 3, search: "" }));

    act(() => {
      expect(result.current.setFilters({ search: "x" })).toBe(true);
    });
    await waitFor(() => expect(result.current.data).toEqual({ page: 1, search: "x" }));
    expect(result.current.setFilters({ search: "x" })).toBe(false);
  });

  it("reports a failure as a message and keeps the last page", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ ok: 1 })
      .mockRejectedValueOnce(new ApiError(500, "boom", { detail: "Servidor caído." }));
    const { result } = renderHook(() => usePagedList(load, { search: "" }, same));
    await waitFor(() => expect(result.current.data).toEqual({ ok: 1 }));

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe("Servidor caído."));
    expect(result.current.data).toEqual({ ok: 1 });
  });
});
