import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppShell from "@/components/layouts/app-shell/app-shell";

let pathname = "/inicio";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

function renderShell() {
  return render(
    <AppShell
      navigation={
        <a href="/inicio" data-testid="nav-link">
          Inicio
        </a>
      }
      account={<button type="button">Cerrar sesión</button>}
    >
      <p>Contenido</p>
    </AppShell>,
  );
}

describe("AppShell", () => {
  afterEach(() => {
    pathname = "/inicio";
    document.body.style.overflow = "";
  });

  it("frames the page with the brand, the navigation, the account and the content", () => {
    renderShell();

    expect(screen.getByRole("navigation", { name: "Principal" })).toContainElement(
      screen.getByTestId("nav-link"),
    );
    expect(screen.getByRole("main")).toHaveTextContent("Contenido");
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    expect(screen.getAllByText("·FCEN").length).toBeGreaterThan(0);
  });

  it("opens the navigation from the menu button on small screens", () => {
    renderShell();
    const menu = screen.getByRole("button", { name: "Abrir menú" });
    expect(menu).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(menu);

    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("nav-link")).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes with Escape and gives focus back to the menu button", () => {
    renderShell();
    const menu = screen.getByRole("button", { name: "Abrir menú" });
    fireEvent.click(menu);

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });

    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes from its own close button and from the scrim", () => {
    renderShell();
    const menu = screen.getByRole("button", { name: "Abrir menú" });

    fireEvent.click(menu);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar menú" }));
    expect(menu).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(menu);
    fireEvent.click(screen.getByTestId("sidebar-scrim"));
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  it("closes once the person navigates somewhere else", () => {
    const { rerender } = renderShell();
    const menu = screen.getByRole("button", { name: "Abrir menú" });
    fireEvent.click(menu);

    pathname = "/admin/usuarios";
    rerender(
      <AppShell navigation={<a href="/inicio">Inicio</a>} account={null}>
        <p>Contenido</p>
      </AppShell>,
    );

    expect(menu).toHaveAttribute("aria-expanded", "false");
  });
});
