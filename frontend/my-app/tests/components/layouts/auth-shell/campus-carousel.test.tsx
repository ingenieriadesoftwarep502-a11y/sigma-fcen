import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CampusCarousel from "@/components/layouts/auth-shell/campus-carousel";

// jsdom has no CSS animations, so React listens for the vendor-prefixed event name.
function finishProgress(element: HTMLElement) {
  fireEvent(element, new Event("webkitAnimationEnd", { bubbles: true }));
}

function activeSlide() {
  return document.querySelector("[data-slide][data-active='true']");
}

describe("CampusCarousel", () => {
  it("starts on the first photo", () => {
    render(<CampusCarousel />);

    expect(activeSlide()).toHaveAttribute("data-slide", "0");
  });

  it("moves to the next photo when the current one finishes", () => {
    render(<CampusCarousel />);

    finishProgress(screen.getByTestId("slide-progress-0"));

    expect(activeSlide()).toHaveAttribute("data-slide", "1");
  });

  it("jumps to the photo chosen by the viewer", () => {
    render(<CampusCarousel />);

    fireEvent.click(screen.getByRole("button", { name: "Ver foto 3 de 4" }));

    expect(activeSlide()).toHaveAttribute("data-slide", "2");
  });

  it("lets the viewer pause and resume the rotation", () => {
    render(<CampusCarousel />);

    fireEvent.click(screen.getByRole("button", { name: "Pausar fotos" }));

    expect(screen.getByRole("button", { name: "Reanudar fotos" })).toBeInTheDocument();
  });

  describe("with reduced motion", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function preferReducedMotion() {
      vi.stubGlobal(
        "matchMedia",
        (query: string) =>
          ({
            matches: query === "(prefers-reduced-motion: reduce)",
            addEventListener: () => {},
            removeEventListener: () => {},
          }) as unknown as MediaQueryList,
      );
    }

    it("starts paused so the photos do not change on their own", () => {
      preferReducedMotion();
      render(<CampusCarousel />);

      expect(screen.getByRole("button", { name: "Reanudar fotos" })).toBeInTheDocument();
      finishProgress(screen.getByTestId("slide-progress-0"));
      expect(activeSlide()).toHaveAttribute("data-slide", "0");
    });

    it("still lets the viewer resume the rotation", () => {
      preferReducedMotion();
      render(<CampusCarousel />);

      fireEvent.click(screen.getByRole("button", { name: "Reanudar fotos" }));
      finishProgress(screen.getByTestId("slide-progress-0"));

      expect(activeSlide()).toHaveAttribute("data-slide", "1");
    });
  });
});
