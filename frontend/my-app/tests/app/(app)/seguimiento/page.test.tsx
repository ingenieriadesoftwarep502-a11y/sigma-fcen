import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TeachingPage from "@/app/(app)/seguimiento/page";
import { SessionProvider } from "@/features/auth/session/session-provider";
import { getCurrentUser, type RoleCode } from "@/lib/auth";
import * as catalog from "@/lib/catalog";
import * as teaching from "@/lib/teaching";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/seguimiento",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog")>()),
  listAllTerms: vi.fn(),
  getCurrentTerm: vi.fn(),
}));
vi.mock("@/lib/teaching", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/teaching")>()),
  listTeachingCourses: vi.fn(),
}));

function renderPageFor(roles: RoleCode[]) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "3f0c2b1e-0000-4000-8000-000000000001",
    email: "laura.rojas@unal.edu.co",
    first_name: "Laura",
    last_name: "Rojas",
    roles,
  });
  render(
    <SessionProvider>
      <TeachingPage />
    </SessionProvider>,
  );
}

describe("TeachingPage (FASE-08)", () => {
  beforeEach(() => {
    vi.mocked(catalog.listAllTerms).mockResolvedValue([]);
    vi.mocked(catalog.getCurrentTerm).mockResolvedValue(null);
    vi.mocked(teaching.listTeachingCourses).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends anyone without the teacher role home", async () => {
    renderPageFor(["STUDENT", "MONITOR", "ADMIN"]);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/inicio"));
    expect(screen.queryByRole("heading", { name: "Seguimiento" })).not.toBeInTheDocument();
    expect(teaching.listTeachingCourses).not.toHaveBeenCalled();
  });

  it("shows the panel to a teacher", async () => {
    renderPageFor(["TEACHER"]);

    expect(
      await screen.findByRole("heading", { name: "Seguimiento", level: 1 }),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith("/inicio");
  });
});
