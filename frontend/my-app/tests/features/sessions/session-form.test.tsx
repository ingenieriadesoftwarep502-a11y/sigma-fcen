import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SessionForm from "@/features/sessions/components/session-form";
import { ApiError } from "@/lib/api-client";
import { listMaterials } from "@/lib/materials";
import { addTopic, listTopics, recordSession, updateSession } from "@/lib/sessions";

import { CADENA, LIMITES, pendingSlot, session } from "./fixtures";

vi.mock("@/lib/sessions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sessions")>()),
  listTopics: vi.fn(),
  addTopic: vi.fn(),
  recordSession: vi.fn(),
  updateSession: vi.fn(),
}));
vi.mock("@/lib/materials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/materials")>()),
  listMaterials: vi.fn(),
}));

const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] };

describe("SessionForm (T-05.16)", () => {
  const onSaved = vi.fn();
  const onBusyChange = vi.fn();

  beforeEach(() => {
    vi.mocked(listTopics).mockResolvedValue([LIMITES, CADENA]);
    vi.mocked(listMaterials).mockResolvedValue(EMPTY_PAGE);
    vi.mocked(recordSession).mockResolvedValue(session());
    vi.mocked(updateSession).mockResolvedValue(session());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderRecord() {
    render(
      <SessionForm
        mode={{ kind: "record", pending: pendingSlot() }}
        onSaved={onSaved}
        onBusyChange={onBusyChange}
      />,
    );
  }

  it("marks everyone as attended by default and records the chosen absences and topics", async () => {
    renderRecord();

    const attendance = screen.getByRole("group", { name: "Asistencia" });
    const luis = within(attendance).getByRole("group", { name: "Luis Gómez" });
    expect(within(luis).getByRole("button", { name: "Asistió" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(within(luis).getByRole("button", { name: "No asistió" }));
    fireEvent.click(await screen.findByRole("button", { name: "Regla de la cadena" }));
    fireEvent.change(screen.getByLabelText("Observaciones (opcional)"), {
      target: { value: "Repasamos derivadas." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(recordSession).toHaveBeenCalledWith({
      slot_id: 21,
      attendance: [
        { reservation_id: "r-1", attendance: "ATTENDED" },
        { reservation_id: "r-2", attendance: "NO_SHOW" },
      ],
      topic_ids: [CADENA.id],
      material_ids: [],
      notes: "Repasamos derivadas.",
    });
    expect(listTopics).toHaveBeenCalledWith(1, expect.any(AbortSignal));
  });

  it("asks for a topic before sending when someone attended (RN-006.7)", async () => {
    renderRecord();
    await screen.findByRole("button", { name: "Límites" });

    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));

    expect(
      await screen.findByText("Si alguien asistió, indica al menos un tema trabajado."),
    ).toBeInTheDocument();
    expect(recordSession).not.toHaveBeenCalled();
  });

  it("adds a new topic to the subject and selects it", async () => {
    vi.mocked(addTopic).mockResolvedValue({ id: "topic-9", name: "Series" });
    renderRecord();
    await screen.findByRole("button", { name: "Límites" });

    fireEvent.change(screen.getByLabelText("Nuevo tema"), { target: { value: "Series" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar tema" }));

    const series = await screen.findByRole("button", { name: "Series" });
    expect(series).toHaveAttribute("aria-pressed", "true");
    expect(addTopic).toHaveBeenCalledWith(1, "Series");
  });

  it("shows the server's message next to the field it belongs to", async () => {
    vi.mocked(recordSession).mockRejectedValue(
      new ApiError(400, "Datos inválidos", {
        attendance: ["Marca la asistencia de todas las reservas confirmadas de la franja."],
      }),
    );
    renderRecord();
    fireEvent.click(await screen.findByRole("button", { name: "Límites" }));

    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));

    expect(
      await screen.findByText("Marca la asistencia de todas las reservas confirmadas de la franja."),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("edits topics and notes without offering to change the attendance (RN-006.8)", async () => {
    render(
      <SessionForm
        mode={{ kind: "edit", session: session() }}
        onSaved={onSaved}
        onBusyChange={onBusyChange}
      />,
    );

    expect(screen.queryByRole("group", { name: "Asistencia" })).not.toBeInTheDocument();
    expect(screen.getByText("Ana Pérez: asistió")).toBeInTheDocument();
    const cadena = await screen.findByRole("button", { name: "Regla de la cadena" });
    expect(cadena).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Límites" }));
    fireEvent.change(screen.getByLabelText("Observaciones (opcional)"), {
      target: { value: "Corregido" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(updateSession).toHaveBeenCalledWith("t-1", {
      topic_ids: [CADENA.id, LIMITES.id],
      material_ids: [],
      notes: "Corregido",
      duration_minutes: 60,
    });
  });
});
