import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/(auth)/login/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

async function renderPage(searchParams: Record<string, string>) {
  render(
    await LoginPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }),
  );
}

describe("LoginPage", () => {
  it("confirms the account was created when coming from registration", async () => {
    await renderPage({ registered: "1" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Tu cuenta fue creada. Inicia sesión para continuar.",
    );
  });

  it("shows no confirmation on a direct visit", async () => {
    await renderPage({});

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
