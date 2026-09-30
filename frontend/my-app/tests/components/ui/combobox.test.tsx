import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AsyncCombobox from "@/components/ui/combobox";

type Person = { id: string; name: string; email: string };

const ANA: Person = { id: "1", name: "Ana Pérez", email: "ana@unal.edu.co" };
const LUIS: Person = { id: "2", name: "Luis Gómez", email: "luis@unal.edu.co" };

function Harness({
  search,
  initial = null,
  onChange = () => {},
}: {
  search: (query: string, signal: AbortSignal) => Promise<Person[]>;
  initial?: Person | null;
  onChange?: (person: Person | null) => void;
}) {
  const [value, setValue] = useState<Person | null>(initial);
  return (
    <AsyncCombobox<Person>
      id="teacher"
      label="Docente"
      placeholder="Busca por nombre o correo"
      value={value}
      onChange={(person) => {
        setValue(person);
        onChange(person);
      }}
      search={search}
      optionKey={(person) => person.id}
      optionLabel={(person) => person.name}
      renderOption={(person) => (
        <>
          {person.name} <small>{person.email}</small>
        </>
      )}
      emptyMessage="Ningún docente coincide."
      delay={0}
    />
  );
}

function combobox() {
  return screen.getByRole("combobox", { name: "Docente" });
}

describe("AsyncCombobox", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("searches as the person types and lists the matches", async () => {
    const search = vi.fn().mockResolvedValue([ANA, LUIS]);
    render(<Harness search={search} />);

    expect(combobox()).toHaveAttribute("aria-expanded", "false");
    fireEvent.change(combobox(), { target: { value: "an" } });

    expect(await screen.findByRole("option", { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Luis Gómez/ })).toBeInTheDocument();
    expect(combobox()).toHaveAttribute("aria-expanded", "true");
    expect(search).toHaveBeenLastCalledWith("an", expect.any(AbortSignal));
    expect(screen.getByText("2 resultados")).toBeInTheDocument();
  });

  it("chooses an option with the arrow keys and Enter", async () => {
    const onChange = vi.fn();
    render(<Harness search={vi.fn().mockResolvedValue([ANA, LUIS])} onChange={onChange} />);

    fireEvent.change(combobox(), { target: { value: "a" } });
    await screen.findByRole("option", { name: /Luis/ });
    fireEvent.keyDown(combobox(), { key: "ArrowDown" });
    fireEvent.keyDown(combobox(), { key: "ArrowDown" });

    const luis = screen.getByRole("option", { name: /Luis/ });
    expect(luis).toHaveAttribute("aria-selected", "true");
    expect(combobox()).toHaveAttribute("aria-activedescendant", luis.id);

    fireEvent.keyDown(combobox(), { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(LUIS);
    expect(combobox()).toHaveValue("Luis Gómez");
    expect(combobox()).toHaveAttribute("aria-expanded", "false");
  });

  it("chooses an option with the pointer", async () => {
    const onChange = vi.fn();
    render(<Harness search={vi.fn().mockResolvedValue([ANA])} onChange={onChange} />);

    fireEvent.change(combobox(), { target: { value: "a" } });
    fireEvent.click(await screen.findByRole("option", { name: /Ana/ }));

    expect(onChange).toHaveBeenLastCalledWith(ANA);
  });

  it("closes the list on Escape without letting the key reach the page", async () => {
    const pageListener = vi.fn();
    document.addEventListener("keydown", pageListener);
    render(<Harness search={vi.fn().mockResolvedValue([ANA])} />);

    fireEvent.change(combobox(), { target: { value: "a" } });
    await screen.findByRole("option", { name: /Ana/ });
    fireEvent.keyDown(combobox(), { key: "Escape" });

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(combobox()).toHaveAttribute("aria-expanded", "false");
    expect(pageListener).not.toHaveBeenCalled();
    document.removeEventListener("keydown", pageListener);
  });

  it("says when nothing matches", async () => {
    render(<Harness search={vi.fn().mockResolvedValue([])} />);

    fireEvent.change(combobox(), { target: { value: "zz" } });

    expect(await screen.findByText("Ningún docente coincide.")).toBeInTheDocument();
  });

  it("drops the choice when the text is edited, and clears it with its button", async () => {
    const onChange = vi.fn();
    render(<Harness search={vi.fn().mockResolvedValue([ANA])} initial={ANA} onChange={onChange} />);

    expect(combobox()).toHaveValue("Ana Pérez");
    fireEvent.click(screen.getByRole("button", { name: "Quitar Docente" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(combobox()).toHaveValue("");
    await waitFor(() => expect(combobox()).toHaveFocus());
  });

  it("opens the first results with ArrowDown on an empty box", async () => {
    const search = vi.fn().mockResolvedValue([ANA]);
    render(<Harness search={search} />);

    fireEvent.keyDown(combobox(), { key: "ArrowDown" });

    expect(await screen.findByRole("option", { name: /Ana/ })).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith("", expect.any(AbortSignal));
  });
});
