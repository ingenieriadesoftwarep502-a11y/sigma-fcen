import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "@/features/auth/session/session-provider";
import MyReservations from "@/features/reservations/components/my-reservations";
import { ApiError } from "@/lib/api-client";
import { getCurrentUser, type RoleCode } from "@/lib/auth";
import {
  cancelReservation,
  listMyReservations,
  type Reservation,
} from "@/lib/reservations";

import { CALCULO_REF, pageOf } from "../../availability/fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/mis-reservas",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/reservations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reservations")>()),
  listMyReservations: vi.fn(),
  cancelReservation: vi.fn(),
}));

const listMock = vi.mocked(listMyReservations);
const cancelMock = vi.mocked(cancelReservation);

const STUDENT_ID = "s-1";
const MONITOR = { id: "m-1", full_name: "Sofía Díaz" };
const STUDENT = { id: STUDENT_ID, full_name: "Ana Pérez" };
const HOUR = 3_600_000;

function startingIn(hours: number) {
  const start = new Date(Date.now() + hours * HOUR);
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + HOUR).toISOString() };
}

function reservation(overrides: Partial<Reservation> = {}, hours = 48): Reservation {
  return {
    id: "r-1",
    slot: {
      id: 21,
      subject: CALCULO_REF,
      monitor: MONITOR,
      term: "2026-2",
      ...startingIn(hours),
      capacity: 1,
      status: "RESERVED",
      modality: "IN_PERSON",
      location: "Bloque 14-203",
    },
    student: STUDENT,
    status: "CONFIRMED",
    student_note: "",
    created_at: new Date().toISOString(),
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: "",
    ...overrides,
  };
}

function signIn(id: string, roles: RoleCode[]) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id,
    email: "persona@unal.edu.co",
    first_name: "Persona",
    last_name: "Prueba",
    roles,
  });
}

function renderPage() {
  render(
    <SessionProvider>
      <MyReservations />
    </SessionProvider>,
  );
}

describe("MyReservations (T-04.20)", () => {
  beforeEach(() => {
    signIn(STUDENT_ID, ["STUDENT"]);
    listMock.mockResolvedValue(pageOf([reservation()]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists the upcoming reservations first, with subject, monitor, place and state", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Mis reservas como estudiante" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Reservas a mis monitorías")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Tus reservas" });
    const item = within(list).getByRole("listitem");
    expect(item).toHaveTextContent("Cálculo diferencial");
    expect(item).toHaveTextContent("Con Sofía Díaz");
    expect(item).toHaveTextContent("Bloque 14-203");
    expect(item).toHaveTextContent("Confirmada");
    expect(listMock).toHaveBeenCalledWith(
      1,
      { role: "student", when: "upcoming", status: null },
      expect.any(AbortSignal),
    );
  });

  it("shows the history with how each reservation ended", async () => {
    renderPage();
    await screen.findByRole("list", { name: "Tus reservas" });
    listMock.mockResolvedValue(
      pageOf([
        reservation(
          {
            status: "NO_SHOW",
            cancelled_by: STUDENT,
            cancelled_at: new Date().toISOString(),
          },
          -24,
        ),
      ]),
    );

    fireEvent.click(screen.getByRole("button", { name: "Historial" }));

    expect(await screen.findByText("Inasistencia")).toBeInTheDocument();
    expect(listMock).toHaveBeenLastCalledWith(
      1,
      { role: "student", when: "past", status: null },
      expect.any(AbortSignal),
    );
    expect(screen.queryByRole("button", { name: /Cancelar reserva/ })).not.toBeInTheDocument();
  });

  it("says when there is nothing booked yet", async () => {
    listMock.mockResolvedValue(pageOf([]));
    renderPage();

    expect(await screen.findByText("No tienes reservas próximas.")).toBeInTheDocument();
  });

  it("cancels in time after a confirmation, and reads the list again", async () => {
    cancelMock.mockResolvedValue(reservation({ status: "CANCELLED" }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Cancelar reserva/ }));
    const confirm = screen.getByRole("group", { name: "Confirmar cancelación" });
    expect(confirm).toHaveTextContent("Tu cupo quedará libre para otra persona.");
    expect(cancelMock).not.toHaveBeenCalled();
    listMock.mockResolvedValue(pageOf([]));

    fireEvent.click(within(confirm).getByRole("button", { name: "Sí, cancelar" }));

    expect(await screen.findByText(/Cancelaste la reserva de Cálculo diferencial/)).toBeInTheDocument();
    expect(cancelMock).toHaveBeenCalledWith("r-1", undefined);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
  });

  it("warns that a late cancellation counts as a no-show (ADR-011)", async () => {
    listMock.mockResolvedValue(pageOf([reservation({}, 2)]));
    cancelMock.mockResolvedValue(reservation({ status: "NO_SHOW" }, 2));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Cancelar reserva/ }));

    const confirm = screen.getByRole("group", { name: "Confirmar cancelación" });
    expect(confirm).toHaveTextContent(
      "Faltan menos de 4 horas: quedará registrada como inasistencia en tu historial.",
    );
    fireEvent.click(within(confirm).getByRole("button", { name: "Sí, cancelar" }));
    expect(
      await screen.findByText(/quedó registrada como inasistencia/),
    ).toBeInTheDocument();
  });

  it("can step back without cancelling", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Cancelar reserva/ }));
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(screen.queryByRole("group", { name: "Confirmar cancelación" })).not.toBeInTheDocument();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it("explains a 409 and reads the list again", async () => {
    cancelMock.mockRejectedValue(
      new ApiError(409, "gone", {
        type: "already_cancelled",
        status: 409,
        detail: "La reserva ya fue cancelada.",
      }),
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Cancelar reserva/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar" }));

    expect(await screen.findByText("La reserva ya fue cancelada.")).toBeInTheDocument();
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
  });

  it("shows the student their own note", async () => {
    listMock.mockResolvedValue(pageOf([reservation({ student_note: "Repasar derivadas" })]));
    renderPage();

    const item = await screen.findByRole("listitem");
    expect(item).toHaveTextContent("Tu nota: “Repasar derivadas”");
  });

  describe("as the monitor of the slot", () => {
    beforeEach(() => {
      signIn(MONITOR.id, ["MONITOR"]);
    });

    it("shows only the reservations on their slots, with the student's note", async () => {
      listMock.mockResolvedValue(pageOf([reservation({ student_note: "Traigo dudas" })]));
      renderPage();

      expect(
        await screen.findByRole("heading", { name: "Reservas a mis monitorías" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Mis reservas como estudiante")).not.toBeInTheDocument();
      expect(await screen.findByRole("listitem")).toHaveTextContent(
        "Nota de Ana Pérez: “Traigo dudas”",
      );
      expect(listMock).toHaveBeenCalledWith(
        1,
        { role: "monitor", when: "upcoming", status: null },
        expect.any(AbortSignal),
      );
    });

    it("shows who booked, and requires a justification to cancel", async () => {
      cancelMock.mockResolvedValue(reservation({ status: "CANCELLED" }));
      renderPage();

      const item = await screen.findByRole("listitem");
      expect(item).toHaveTextContent("Reservó Ana Pérez");
      fireEvent.click(within(item).getByRole("button", { name: /Cancelar reserva/ }));
      const confirm = screen.getByRole("group", { name: "Confirmar cancelación" });
      expect(confirm).toHaveTextContent("Ana Pérez verá tu justificación.");

      fireEvent.click(within(confirm).getByRole("button", { name: "Sí, cancelar" }));
      expect(await screen.findByText("Escribe la justificación de la cancelación.")).toBeInTheDocument();
      expect(cancelMock).not.toHaveBeenCalled();

      fireEvent.change(within(confirm).getByLabelText("Justificación"), {
        target: { value: "  Calamidad doméstica " },
      });
      fireEvent.click(within(confirm).getByRole("button", { name: "Sí, cancelar" }));

      await waitFor(() => expect(cancelMock).toHaveBeenCalledWith("r-1", "Calamidad doméstica"));
    });
  });

  describe("with both roles (ADR-008)", () => {
    beforeEach(() => {
      signIn(MONITOR.id, ["STUDENT", "MONITOR"]);
    });

    it("separates the reservations on their slots from the ones they booked", async () => {
      renderPage();

      const tabs = await screen.findByRole("tablist", { name: "Tipo de reservas" });
      const monitorTab = within(tabs).getByRole("tab", { name: "Reservas a mis monitorías" });
      expect(monitorTab).toHaveAttribute("aria-selected", "true");
      await waitFor(() =>
        expect(listMock).toHaveBeenCalledWith(
          1,
          { role: "monitor", when: "upcoming", status: null },
          expect.any(AbortSignal),
        ),
      );

      fireEvent.click(within(tabs).getByRole("tab", { name: "Mis reservas como estudiante" }));

      await waitFor(() =>
        expect(listMock).toHaveBeenLastCalledWith(
          1,
          { role: "student", when: "upcoming", status: null },
          expect.any(AbortSignal),
        ),
      );
      expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Mis reservas como estudiante");
    });
  });
});
