import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Home page", () => {
  it("shows the product name as the main heading", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "SIGMA-FCEN" })).toBeInTheDocument();
  });

  it("describes the purpose of the system in Spanish", () => {
    render(<Home />);

    expect(screen.getByText(/gestión de monitorías académicas/i)).toBeInTheDocument();
  });
});
