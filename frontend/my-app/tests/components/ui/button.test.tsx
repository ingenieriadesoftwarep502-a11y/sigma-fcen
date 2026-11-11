import { fireEvent, render, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import Button from "@/components/ui/button";

describe("Button", () => {
  describe("softDisabled", () => {
    it("announces itself as unavailable but stays focusable, so focus is not lost", () => {
      const { rerender } = render(<Button>Guardar</Button>);
      const button = screen.getByRole("button", { name: "Guardar" });
      button.focus();

      rerender(<Button softDisabled>Guardar</Button>);

      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).not.toBeDisabled();
      expect(button).toHaveFocus();
    });

    it("ignores clicks while unavailable", () => {
      const onClick = vi.fn();
      render(
        <Button softDisabled onClick={onClick}>
          Guardar
        </Button>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      expect(onClick).not.toHaveBeenCalled();
    });

    it("does not submit its form while unavailable", () => {
      const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
      render(
        <form onSubmit={onSubmit}>
          <Button type="submit" softDisabled>
            Guardar
          </Button>
        </form>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("works normally when available", () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Guardar</Button>);

      const button = screen.getByRole("button", { name: "Guardar" });
      fireEvent.click(button);

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(button).not.toHaveAttribute("aria-disabled");
    });
  });
});
