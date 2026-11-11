import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TemplateList from "@/features/availability/components/template-list";
import { deactivateTemplate, listMyTemplates } from "@/lib/availability";

import { CALCULO_ASSIGNMENT, INACTIVE_TEMPLATE, pageOf, WEEKLY_TEMPLATE } from "../fixtures";

vi.mock("@/lib/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/availability")>()),
  listMyTemplates: vi.fn(),
  deactivateTemplate: vi.fn(),
}));

const listMock = vi.mocked(listMyTemplates);

function renderList() {
  const onCreate = vi.fn();
  const onChanged = vi.fn();
  render(
    <TemplateList
      assignment={CALCULO_ASSIGNMENT}
      version={0}
      onCreate={onCreate}
      onChanged={onChanged}
    />,
  );
  return { onCreate, onChanged };
}

describe("TemplateList (T-03.16)", () => {
  beforeEach(() => {
    listMock.mockResolvedValue(pageOf([INACTIVE_TEMPLATE, WEEKLY_TEMPLATE]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists the assignment's templates, active ones first", async () => {
    renderList();

    const list = await screen.findByRole("list", { name: "Tus plantillas semanales" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Miércoles");
    expect(items[0]).toHaveTextContent("14:30–15:30");
    expect(items[0]).toHaveTextContent("Grupal · 6 cupos · 8 franjas");
    expect(items[1]).toHaveTextContent("Inactiva");
    expect(screen.getByText(/1 activa/)).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith(
      1,
      { term: "2026-2", subject: 1 },
      expect.any(AbortSignal),
    );
  });

  it("deactivates a template after a confirmation", async () => {
    vi.mocked(deactivateTemplate).mockResolvedValue(undefined);
    const { onChanged } = renderList();

    fireEvent.click(
      await screen.findByRole("button", { name: "Desactivar la plantilla del miércoles 14:30" }),
    );
    const confirm = screen.getByRole("button", { name: "Desactivar" });
    expect(confirm).toHaveFocus();
    fireEvent.click(confirm);

    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(deactivateTemplate).toHaveBeenCalledWith(3);
  });

  it("invites to create the first template", async () => {
    listMock.mockResolvedValue(pageOf([]));
    const { onCreate } = renderList();

    fireEvent.click(await screen.findByRole("button", { name: /Aún no tienes plantillas/ }));

    expect(onCreate).toHaveBeenCalled();
  });
});
