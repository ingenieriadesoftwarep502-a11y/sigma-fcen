import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MyMonitoringPage from "@/app/(app)/mis-monitorias/page";
import { SessionProvider } from "@/features/auth/session/session-provider";
import { getCurrentUser, type RoleCode } from "@/lib/auth";
import * as catalog from "@/lib/catalog";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/mis-monitorias",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  listSubjects: vi.fn(),
  listMyCourses: vi.fn(),
  listMyAssignments: vi.fn(),
  getCatalogSummary: vi.fn(),
  listAllDepartments: vi.fn(),
  listAllTerms: vi.fn(),
  getCurrentTerm: vi.fn(),
}));

const EMPTY_MyMonitoringPage = { count: 0, next: null, previous: null, results: [] };

function renderPageFor(roles: RoleCode[]) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "3f0c2b1e-0000-4000-8000-000000000001",
    email: "ana.perez@unal.edu.co",
    first_name: "Ana",
    last_name: "Pérez",
    roles,
  });
  render(
    <SessionProvider>
      <MyMonitoringPage />
    </SessionProvider>,
  );
}

describe("MyMonitoringPage", () => {
  beforeEach(() => {
    vi.mocked(catalog.listSubjects).mockResolvedValue(EMPTY_MyMonitoringPage);
    vi.mocked(catalog.listMyCourses).mockResolvedValue([]);
    vi.mocked(catalog.listMyAssignments).mockResolvedValue([]);
    vi.mocked(catalog.getCatalogSummary).mockResolvedValue({
      term: null,
      subjects_active: 0,
      departments_active: 0,
      courses: 0,
      courses_without_teacher: 0,
      courses_without_monitor: 0,
      monitor_assignments: 0,
      committed_hours_total: 0,
    });
    vi.mocked(catalog.listAllDepartments).mockResolvedValue([]);
    vi.mocked(catalog.listAllTerms).mockResolvedValue([]);
    vi.mocked(catalog.getCurrentTerm).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends anyone without the role home", async () => {
    renderPageFor(["STUDENT", "TEACHER", "ADMIN"]);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/inicio"));
    expect(screen.queryByRole("heading", { name: "Mis monitorías" })).not.toBeInTheDocument();
    expect(catalog.listMyAssignments).not.toHaveBeenCalled();
  });

  it("shows the page to a monitor", async () => {
    renderPageFor(["MONITOR"]);

    expect(await screen.findByRole("heading", { name: "Mis monitorías", level: 1 })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith("/inicio");
  });

  it("shows the page to a student who is also a monitor", async () => {
    renderPageFor(["STUDENT", "MONITOR"]);

    expect(
      await screen.findByRole("heading", { name: "Mis monitorías", level: 1 }),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith("/inicio");
  });
});
