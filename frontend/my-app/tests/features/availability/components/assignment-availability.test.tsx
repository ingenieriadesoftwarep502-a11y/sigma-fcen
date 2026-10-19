import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AssignmentAvailability from "@/features/availability/components/assignment-availability";
import { ApiError } from "@/lib/api-client";
import {
  cancelSlot,
  createSlot,
  createTemplate,
  deactivateTemplate,
  listMySlots,
  listMyTemplates,
  updateSlot,
} from "@/lib/availability";
import type { MonitorOwnAssignment } from "@/lib/catalog";

import {
  CALCULO_ASSIGNMENT,
  GROUP_SLOT,
  INACTIVE_TEMPLATE,
  INDIVIDUAL_SLOT,
  MECANICA_ASSIGNMENT,
  pageOf,
  RESERVED_SLOT,
  WEEKLY_TEMPLATE,
} from "../fixtures";

vi.mock("@/lib/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/availability")>()),
  listMySlots: vi.fn(),
  createSlot: vi.fn(),
  updateSlot: vi.fn(),
  cancelSlot: vi.fn(),
  listMyTemplates: vi.fn(),
  createTemplate: vi.fn(),
  deactivateTemplate: vi.fn(),
}));

const listMySlotsMock = vi.mocked(listMySlots);
const createSlotMock = vi.mocked(createSlot);
const updateSlotMock = vi.mocked(updateSlot);
const cancelSlotMock = vi.mocked(cancelSlot);
const listMyTemplatesMock = vi.mocked(listMyTemplates);
const createTemplateMock = vi.mocked(createTemplate);
const deactivateTemplateMock = vi.mocked(deactivateTemplate);

async function renderSlots(assignment: MonitorOwnAssignment = CALCULO_ASSIGNMENT) {
  render(<AssignmentAvailability assignment={assignment} />);
  return screen.findByRole("table");
}

async function renderTemplates(assignment: MonitorOwnAssignment = MECANICA_ASSIGNMENT) {
  render(<AssignmentAvailability assignment={assignment} />);
  fireEvent.click(screen.getByRole("tab", { name: "Plantillas semanales" }));
  return screen.findByRole("table");
}

function openSlotForm() {
  fireEvent.click(screen.getByRole("button", { name: "Publicar franja" }));
  const form = screen.getByRole("dialog", { name: "Publicar franja" });
  // The subject is the assignment's own: shown, never picked.
  expect(within(form).getByText("MAT-101 · Cálculo diferencial")).toBeInTheDocument();
  expect(within(form).queryByLabelText("Asignatura")).not.toBeInTheDocument();
  return form;
}

function fill(scope: HTMLElement, label: string, value: string) {
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });
}

function fillSlot(form: HTMLElement) {
  fill(form, "Fecha", "2026-10-20");
  fill(form, "Hora de inicio", "10:00");
  fill(form, "Aula o lugar", "Bloque 14-203");
}

describe("AssignmentAvailability slots (T-03.16)", () => {
  beforeEach(() => {
    listMySlotsMock.mockResolvedValue(pageOf([INDIVIDUAL_SLOT, GROUP_SLOT, RESERVED_SLOT]));
    listMyTemplatesMock.mockResolvedValue(pageOf([WEEKLY_TEMPLATE, INACTIVE_TEMPLATE]));
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  it("lists the monitor's slots in Bogotá time with their session type and state", async () => {
    const table = await renderSlots();
    const rows = within(table).getAllByRole("row");

    expect(rows[1]).toHaveTextContent(/martes, 20 de octubre/i);
    expect(rows[1]).toHaveTextContent("10:00–11:00");
    expect(rows[1]).toHaveTextContent("Individual");
    expect(rows[1]).toHaveTextContent("Presencial");
    expect(rows[1]).toHaveTextContent("Disponible");
    expect(rows[2]).toHaveTextContent("14:30–15:30");
    expect(rows[2]).toHaveTextContent("Grupal · 6 cupos");
    expect(rows[2]).toHaveTextContent("Virtual");
    expect(rows[3]).toHaveTextContent("Sin cupos");
    expect(screen.getByText("3 franjas")).toBeInTheDocument();
    // Only this assignment's subject, in the assignment's term.
    expect(listMySlotsMock).toHaveBeenCalledWith(
      1,
      { term: "2026-2", subject: 1, status: null },
      expect.any(AbortSignal),
    );
  });

  it("follows the term of an assignment from another period", async () => {
    await renderSlots({ ...CALCULO_ASSIGNMENT, term: "2026-1" });

    expect(listMySlotsMock).toHaveBeenCalledWith(
      1,
      { term: "2026-1", subject: 1, status: null },
      expect.any(AbortSignal),
    );
  });

  it("filters the list by state", async () => {
    await renderSlots();

    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "CANCELLED" } });

    await waitFor(() =>
      expect(listMySlotsMock).toHaveBeenLastCalledWith(
        1,
        { term: "2026-2", subject: 1, status: "CANCELLED" },
        expect.any(AbortSignal),
      ),
    );
  });

  it("publishes an individual slot on an assigned subject", async () => {
    createSlotMock.mockResolvedValue({ ...INDIVIDUAL_SLOT, id: 30 });
    await renderSlots();
    const form = openSlotForm();

    fillSlot(form);
    fireEvent.click(within(form).getByRole("button", { name: "Publicar franja" }));

    await waitFor(() =>
      expect(createSlotMock).toHaveBeenCalledWith({
        subject: 1,
        starts_at: "2026-10-20T10:00:00-05:00",
        modality: "IN_PERSON",
        location: "Bloque 14-203",
        capacity: 1,
      }),
    );
    expect(await screen.findByText(/Se publicó la franja de MAT-101/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks a group session for more than one seat", async () => {
    createSlotMock.mockResolvedValue({ ...GROUP_SLOT, id: 31 });
    await renderSlots();
    const form = openSlotForm();

    fillSlot(form);
    fill(form, "Modalidad", "VIRTUAL");
    fill(form, "Enlace de la sesión", "https://meet.example.org/abc");
    expect(within(form).queryByLabelText("Cupos")).not.toBeInTheDocument();
    fireEvent.click(within(form).getByRole("radio", { name: "Grupal" }));
    fill(form, "Cupos", "1");
    fireEvent.click(within(form).getByRole("button", { name: "Publicar franja" }));

    expect(
      await within(form).findByText("Una sesión grupal necesita entre 2 y 32767 cupos."),
    ).toBeInTheDocument();
    expect(createSlotMock).not.toHaveBeenCalled();

    fill(form, "Cupos", "5");
    fireEvent.click(within(form).getByRole("button", { name: "Publicar franja" }));

    await waitFor(() =>
      expect(createSlotMock).toHaveBeenCalledWith(
        expect.objectContaining({
          modality: "VIRTUAL",
          location: "https://meet.example.org/abc",
          capacity: 5,
        }),
      ),
    );
  });

  it("shows the overlap rule next to the start", async () => {
    createSlotMock.mockRejectedValue(
      new ApiError(400, "Bad Request", { starts_at: ["Se solapa con otra franja tuya."] }),
    );
    await renderSlots();
    const form = openSlotForm();

    fillSlot(form);
    fireEvent.click(within(form).getByRole("button", { name: "Publicar franja" }));

    expect(await within(form).findByText("Se solapa con otra franja tuya.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Hora de inicio")).toHaveAttribute("aria-invalid", "true");
  });

  it("explains when the date falls where the monitor is not assigned to the subject", async () => {
    const detail = "No tienes una asignación de monitoría en esta asignatura y período.";
    createSlotMock.mockRejectedValue(new ApiError(403, "Forbidden", { detail }));
    await renderSlots();
    const form = openSlotForm();

    fillSlot(form);
    fireEvent.click(within(form).getByRole("button", { name: "Publicar franja" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(detail);
  });

  it("edits only available slots", async () => {
    updateSlotMock.mockResolvedValue({ ...INDIVIDUAL_SLOT, location: "Bloque 14-204" });
    const table = await renderSlots();
    const rows = within(table).getAllByRole("row");

    expect(within(rows[3]!).queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
    expect(within(rows[3]!).queryByRole("button", { name: /Retirar/ })).not.toBeInTheDocument();

    fireEvent.click(within(rows[1]!).getByRole("button", { name: /Editar franja/ }));
    const form = screen.getByRole("dialog", { name: "Editar franja" });
    expect(within(form).getByLabelText("Fecha")).toHaveValue("2026-10-20");
    expect(within(form).getByLabelText("Hora de inicio")).toHaveValue("10:00");
    fill(form, "Aula o lugar", "Bloque 14-204");
    fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(updateSlotMock).toHaveBeenCalledWith(21, {
        starts_at: "2026-10-20T10:00:00-05:00",
        modality: "IN_PERSON",
        location: "Bloque 14-204",
        capacity: 1,
      }),
    );
  });

  it("explains when a slot can no longer be edited", async () => {
    const detail = "La franja tiene una reserva y no se puede modificar ni retirar.";
    updateSlotMock.mockRejectedValue(new ApiError(409, "Conflict", { detail }));
    const table = await renderSlots();

    fireEvent.click(within(within(table).getAllByRole("row")[1]!).getByRole("button", {
      name: /Editar franja/,
    }));
    const form = screen.getByRole("dialog", { name: "Editar franja" });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

    expect(await within(form).findByText(detail)).toBeInTheDocument();
  });

  it("explains on edit that the monitor is not assigned to the subject in the new term", async () => {
    const detail = "No tienes una asignación de monitoría en esta asignatura y período.";
    updateSlotMock.mockRejectedValue(new ApiError(403, "Forbidden", { detail }));
    const table = await renderSlots();

    fireEvent.click(within(within(table).getAllByRole("row")[1]!).getByRole("button", {
      name: /Editar franja/,
    }));
    const form = screen.getByRole("dialog", { name: "Editar franja" });
    fill(form, "Fecha", "2027-02-16");
    fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(detail);
  });

  it("shows a subject error on edit even though the subject cannot be changed", async () => {
    const message = "La asignatura no está activa en el período de la nueva fecha.";
    updateSlotMock.mockRejectedValue(new ApiError(400, "Bad Request", { subject: [message] }));
    const table = await renderSlots();

    fireEvent.click(within(within(table).getAllByRole("row")[1]!).getByRole("button", {
      name: /Editar franja/,
    }));
    const form = screen.getByRole("dialog", { name: "Editar franja" });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(message);
  });

  it("withdraws a slot after confirming", async () => {
    cancelSlotMock.mockResolvedValue(undefined);
    const table = await renderSlots();
    const row = within(table).getAllByRole("row")[1]!;

    fireEvent.click(within(row).getByRole("button", { name: /Retirar franja/ }));
    fireEvent.click(within(row).getByRole("button", { name: "Confirmar retiro" }));

    await waitFor(() => expect(cancelSlotMock).toHaveBeenCalledWith(21));
    expect(await screen.findByText(/Se retiró la franja/)).toBeInTheDocument();
    expect(listMySlotsMock).toHaveBeenCalledTimes(2);
  });
});

describe("AssignmentAvailability weekly templates (T-03.16)", () => {
  beforeEach(() => {
    listMySlotsMock.mockResolvedValue(pageOf([]));
    listMyTemplatesMock.mockResolvedValue(pageOf([WEEKLY_TEMPLATE, INACTIVE_TEMPLATE]));
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  it("lists templates with their weekday, session type and generated slots", async () => {
    const table = await renderTemplates();
    const rows = within(table).getAllByRole("row");

    expect(screen.getByRole("tab", { name: "Plantillas semanales" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(rows[1]).toHaveTextContent("Miércoles");
    expect(rows[1]).toHaveTextContent("14:30–15:30");
    expect(rows[1]).toHaveTextContent("Grupal · 6 cupos");
    expect(rows[1]).toHaveTextContent("8 franjas");
    expect(rows[1]).toHaveTextContent("Activa");
    expect(rows[2]).toHaveTextContent("Inactiva");
    expect(within(rows[2]!).queryByRole("button", { name: /Desactivar/ })).not.toBeInTheDocument();
    expect(listMyTemplatesMock).toHaveBeenCalledWith(
      1,
      { term: "2026-2", subject: 2 },
      expect.any(AbortSignal),
    );
  });

  it("creates a weekly group template for the assignment's subject and term", async () => {
    createTemplateMock.mockResolvedValue({ ...WEEKLY_TEMPLATE, id: 5, slots_created: 7 });
    await renderTemplates();

    fireEvent.click(screen.getByRole("button", { name: "Nueva plantilla" }));
    const form = screen.getByRole("dialog", { name: "Nueva plantilla semanal" });
    expect(within(form).getByText("FIS-201 · Mecánica")).toBeInTheDocument();
    expect(within(form).queryByLabelText("Asignatura")).not.toBeInTheDocument();
    fill(form, "Día de la semana", "2");
    fill(form, "Hora de inicio", "14:30");
    fill(form, "Modalidad", "VIRTUAL");
    fill(form, "Enlace de la sesión", "https://meet.example.org/fis");
    fireEvent.click(within(form).getByRole("radio", { name: "Grupal" }));
    fill(form, "Cupos", "6");
    fireEvent.click(within(form).getByRole("button", { name: "Crear plantilla" }));

    await waitFor(() =>
      expect(createTemplateMock).toHaveBeenCalledWith({
        subject: 2,
        term: "2026-2",
        weekday: 2,
        start_time: "14:30",
        modality: "VIRTUAL",
        location: "https://meet.example.org/fis",
        capacity: 6,
      }),
    );
    expect(await screen.findByText(/se publicaron 7 franjas/)).toBeInTheDocument();
  });

  it("shows the weeks that collide next to the start, without raw dates elsewhere", async () => {
    const message = "Estas semanas se solapan con otras franjas tuyas: 2026-10-21.";
    createTemplateMock.mockRejectedValue(
      new ApiError(400, "Bad Request", { start_time: [message], conflicts: ["2026-10-21"] }),
    );
    await renderTemplates();

    fireEvent.click(screen.getByRole("button", { name: "Nueva plantilla" }));
    const form = screen.getByRole("dialog", { name: "Nueva plantilla semanal" });
    expect(within(form).getByText("FIS-201 · Mecánica")).toBeInTheDocument();
    expect(within(form).queryByLabelText("Asignatura")).not.toBeInTheDocument();
    fill(form, "Día de la semana", "2");
    fill(form, "Hora de inicio", "14:30");
    fill(form, "Aula o lugar", "Bloque 14-203");
    fireEvent.click(within(form).getByRole("button", { name: "Crear plantilla" }));

    expect(await within(form).findByText(message)).toBeInTheDocument();
    expect(within(form).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("deactivates a template after confirming", async () => {
    deactivateTemplateMock.mockResolvedValue(undefined);
    const table = await renderTemplates();
    const row = within(table).getAllByRole("row")[1]!;

    fireEvent.click(within(row).getByRole("button", { name: /Desactivar plantilla/ }));
    fireEvent.click(within(row).getByRole("button", { name: "Confirmar desactivación" }));

    await waitFor(() => expect(deactivateTemplateMock).toHaveBeenCalledWith(3));
    expect(await screen.findByText(/Se desactivó la plantilla/)).toBeInTheDocument();
  });

  it("fills the term of an assignment from another period", async () => {
    createTemplateMock.mockResolvedValue({ ...WEEKLY_TEMPLATE, id: 6, term: "2026-1" });
    await renderTemplates({ ...MECANICA_ASSIGNMENT, term: "2026-1" });

    expect(listMyTemplatesMock).toHaveBeenCalledWith(
      1,
      { term: "2026-1", subject: 2 },
      expect.any(AbortSignal),
    );
    fireEvent.click(screen.getByRole("button", { name: "Nueva plantilla" }));
    const form = screen.getByRole("dialog", { name: "Nueva plantilla semanal" });
    expect(within(form).getByText(/hasta el fin del período 2026-1/)).toBeInTheDocument();
    fill(form, "Día de la semana", "0");
    fill(form, "Hora de inicio", "08:00");
    fill(form, "Aula o lugar", "Bloque 14-203");
    fireEvent.click(within(form).getByRole("button", { name: "Crear plantilla" }));

    await waitFor(() =>
      expect(createTemplateMock).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 2, term: "2026-1" }),
      ),
    );
  });
});
