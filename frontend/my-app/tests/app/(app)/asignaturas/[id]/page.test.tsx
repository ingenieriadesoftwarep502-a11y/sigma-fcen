import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SubjectPage from "@/app/(app)/asignaturas/[id]/page";
import { SessionProvider } from "@/features/auth/session/session-provider";
import { getCurrentUser, type RoleCode } from "@/lib/auth";
import * as availability from "@/lib/availability";
import * as catalog from "@/lib/catalog";

const replace = vi.fn();
const notFound = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/asignaturas/1",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => notFound(),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  getSubject: vi.fn(),
  listSubjectMonitors: vi.fn(),
  listAllTerms: vi.fn(),
  getCurrentTerm: vi.fn(),
}));
vi.mock("@/lib/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/availability")>()),
  searchSlots: vi.fn(),
}));

const CALCULO = {
  id: 1,
  code: "MAT-101",
  name: "Cálculo diferencial",
  credits: 4,
  is_active: true,
  department: { id: 1, code: "MAT", name: "Matemáticas" },
  monitor_count: 0,
};

async function renderPageFor(roles: RoleCode[], id = "1") {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "3f0c2b1e-0000-4000-8000-000000000001",
    email: "ana.perez@unal.edu.co",
    first_name: "Ana",
    last_name: "Pérez",
    roles,
  });
  const page = await SubjectPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve({}),
  });
  render(<SessionProvider>{page}</SessionProvider>);
}

describe("SubjectPage", () => {
  beforeEach(() => {
    vi.mocked(catalog.getSubject).mockResolvedValue(CALCULO);
    vi.mocked(catalog.listSubjectMonitors).mockResolvedValue([]);
    vi.mocked(catalog.listAllTerms).mockResolvedValue([]);
    vi.mocked(catalog.getCurrentTerm).mockResolvedValue(null);
    vi.mocked(availability.searchSlots).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends anyone without the student role home", async () => {
    await renderPageFor(["MONITOR", "TEACHER", "ADMIN"]);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/inicio"));
    expect(catalog.getSubject).not.toHaveBeenCalled();
  });

  it("shows the subject to a student", async () => {
    await renderPageFor(["STUDENT"]);

    expect(
      await screen.findByRole("heading", { name: "Cálculo diferencial", level: 1 }),
    ).toBeInTheDocument();
    expect(catalog.getSubject).toHaveBeenCalledWith(1, null, expect.any(AbortSignal));
  });

  it("answers 404 for an id that is not a number", async () => {
    await renderPageFor(["STUDENT"], "abc");

    expect(notFound).toHaveBeenCalled();
  });
});
