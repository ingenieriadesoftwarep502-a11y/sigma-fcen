import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import UserAdmin from "@/features/users/components/user-admin";
import { ApiError } from "@/lib/api-client";
import { saveFile } from "@/lib/download";
import {
  type AdminUser,
  createUser,
  deactivateUser,
  exportUsers,
  listUsers,
  NO_FILTERS,
  setUserRoles,
  type UserPage,
  updateUser,
} from "@/lib/users";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/admin/usuarios",
  useSearchParams: () => searchParams,
}));
vi.mock("@/lib/users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/users")>()),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  setUserRoles: vi.fn(),
  deactivateUser: vi.fn(),
  exportUsers: vi.fn(),
}));
vi.mock("@/lib/download", () => ({ saveFile: vi.fn() }));

const listUsersMock = vi.mocked(listUsers);
const createUserMock = vi.mocked(createUser);
const updateUserMock = vi.mocked(updateUser);
const setUserRolesMock = vi.mocked(setUserRoles);
const deactivateUserMock = vi.mocked(deactivateUser);
const exportUsersMock = vi.mocked(exportUsers);
const saveFileMock = vi.mocked(saveFile);

const LUIS: AdminUser = {
  id: "3f0c2b1e-0000-4000-8000-000000000002",
  email: "luis.gomez@unal.edu.co",
  first_name: "Luis",
  last_name: "Gómez",
  roles: ["TEACHER"],
  is_active: true,
  date_joined: "2026-02-01T10:00:00Z",
};

const MARTA: AdminUser = {
  id: "3f0c2b1e-0000-4000-8000-000000000003",
  email: "marta.ruiz@unal.edu.co",
  first_name: "Marta",
  last_name: "Ruiz",
  roles: ["STUDENT", "MONITOR"],
  is_active: false,
  date_joined: "2026-03-01T10:00:00Z",
};

function pageOf(results: AdminUser[], extra: Partial<UserPage> = {}): UserPage {
  return { count: results.length, next: null, previous: null, results, ...extra };
}

async function renderWith(page: UserPage) {
  listUsersMock.mockResolvedValue(page);
  render(<UserAdmin />);
  await screen.findByRole("table");
}

function panel(name: string) {
  return screen.getByRole("dialog", { name });
}

/** The row's edit trigger: its accessible name holds the person's name and email. */
function rowButton(email: string) {
  return screen.getByRole("button", { name: new RegExp(email.replace(/[.]/g, "\.")) });
}

async function openEditor(email: string) {
  await screen.findByRole("table");
  fireEvent.click(rowButton(email));
  return panel("Editar usuario");
}

function fill(scope: HTMLElement, label: string | RegExp, value: string) {
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });
}

describe("UserAdmin (T-01.16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  describe("user list", () => {
    it("shows every user with their roles and account status", async () => {
      await renderWith(pageOf([LUIS, MARTA]));

      const rows = within(screen.getByRole("table")).getAllByRole("row");
      expect(within(rows[0]!).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
        "Usuario",
        "Roles",
        "Estado",
        "Registro",
      ]);
      expect(rows[1]).toHaveTextContent("luis.gomez@unal.edu.co");
      expect(rows[1]).toHaveTextContent("Luis Gómez");
      expect(rows[1]).toHaveTextContent("Docente");
      expect(rows[1]).toHaveTextContent("Activa");
      expect(rows[2]).toHaveTextContent("Estudiante");
      expect(rows[2]).toHaveTextContent("Monitor");
      expect(rows[2]).toHaveTextContent("Inactiva");
      expect(rows[1]).toHaveTextContent(/1 feb\.? 2026/);
      expect(screen.getByText("2 usuarios")).toBeInTheDocument();
      expect(listUsersMock).toHaveBeenCalledWith(1, NO_FILTERS, expect.any(AbortSignal));
    });

    it("pages through the list as the API allows", async () => {
      await renderWith(pageOf([LUIS], { count: 45, next: "http://api.test/api/v1/users/?page=2" }));

      expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Anterior" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );

      listUsersMock.mockResolvedValue(
        pageOf([MARTA], {
          count: 45,
          next: "http://api.test/api/v1/users/?page=3",
          previous: "http://api.test/api/v1/users/",
        }),
      );
      const next = screen.getByRole("button", { name: "Siguiente" });
      next.focus();
      fireEvent.click(next);

      // Unavailable while the page loads, but the keyboard stays where it was.
      expect(next).toHaveAttribute("aria-disabled", "true");
      expect(next).toHaveFocus();
      expect(await screen.findByText("Página 2 de 3")).toBeInTheDocument();
      expect(next).toHaveFocus();
      expect(listUsersMock).toHaveBeenLastCalledWith(2, NO_FILTERS, expect.any(AbortSignal));
      expect(rowButton(MARTA.email)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Anterior" })).not.toHaveAttribute("aria-disabled");
    });

    it("lets the keyboard scroll the table sideways and shows full values on hover", async () => {
      await renderWith(pageOf([LUIS]));

      const scroller = screen.getByRole("region", { name: "Lista de usuarios" });
      expect(scroller).toHaveAttribute("tabindex", "0");
      expect(within(scroller).getByRole("table")).toBeInTheDocument();
      expect(within(rowButton(LUIS.email)).getByText(LUIS.email)).toHaveAttribute(
        "title",
        LUIS.email,
      );
      expect(within(rowButton(LUIS.email)).getByText("Luis Gómez")).toHaveAttribute(
        "title",
        "Luis Gómez",
      );
    });

    it("says so when there are no users yet", async () => {
      await renderWith(pageOf([]));

      expect(screen.getByText("Aún no hay usuarios registrados.")).toBeInTheDocument();
    });

    it("says it is loading while the first page arrives", () => {
      listUsersMock.mockReturnValue(new Promise(() => {}));

      render(<UserAdmin />);

      expect(screen.getByText("Cargando usuarios…")).toBeInTheDocument();
    });

    it("explains a failure to load the list and lets the person retry", async () => {
      listUsersMock
        .mockRejectedValueOnce(new ApiError(0, "Network error"))
        .mockResolvedValueOnce(pageOf([LUIS]));
      render(<UserAdmin />);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "No pudimos conectar con el servidor. Intenta de nuevo.",
      );
      fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));

      await screen.findByRole("table");
      expect(rowButton(LUIS.email)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("creating a user", () => {
    async function openCreator() {
      fireEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
      return panel("Nuevo usuario");
    }

    function fillNewUser(form: HTMLElement) {
      fill(form, "Nombre", "Luis");
      fill(form, "Apellido", "Gómez");
      fill(form, /correo institucional/i, "luis.gomez@unal.edu.co");
      fill(form, /contraseña/i, "Str0ng-Passw0rd!");
      fireEvent.click(within(form).getByLabelText("Docente"));
    }

    it("creates the account, refreshes the list and confirms it", async () => {
      await renderWith(pageOf([]));
      const form = await openCreator();
      createUserMock.mockResolvedValue(LUIS);
      listUsersMock.mockResolvedValue(pageOf([LUIS]));

      fillNewUser(form);
      fireEvent.click(within(form).getByRole("button", { name: "Crear usuario" }));

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Se creó la cuenta de luis.gomez@unal.edu.co.",
      );
      expect(createUserMock).toHaveBeenCalledWith({
        first_name: "Luis",
        last_name: "Gómez",
        email: "luis.gomez@unal.edu.co",
        password: "Str0ng-Passw0rd!",
        roles: ["STUDENT", "TEACHER"],
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => expect(rowButton(LUIS.email)).toBeInTheDocument());
      expect(listUsersMock).toHaveBeenCalledTimes(2);
    });

    it("requires every field and at least one role before calling the API", async () => {
      await renderWith(pageOf([]));
      const form = await openCreator();

      fireEvent.click(within(form).getByLabelText("Estudiante"));
      fireEvent.click(within(form).getByRole("button", { name: "Crear usuario" }));

      expect(await within(form).findByText("Ingresa el nombre.")).toBeInTheDocument();
      expect(within(form).getByText("Ingresa el apellido.")).toBeInTheDocument();
      expect(within(form).getByText("Ingresa el correo.")).toBeInTheDocument();
      expect(within(form).getByText("Ingresa una contraseña.")).toBeInTheDocument();
      expect(within(form).getByText("Selecciona al menos un rol.")).toBeInTheDocument();
      expect(createUserMock).not.toHaveBeenCalled();
    });

    it("shows the server's validation messages next to their fields", async () => {
      await renderWith(pageOf([]));
      const form = await openCreator();
      createUserMock.mockRejectedValue(
        new ApiError(400, "Bad request", {
          email: ["Ya existe una cuenta con este correo."],
          password: ["La contraseña es demasiado común."],
        }),
      );

      fillNewUser(form);
      fireEvent.click(within(form).getByRole("button", { name: "Crear usuario" }));

      expect(
        await within(form).findByText("Ya existe una cuenta con este correo."),
      ).toBeInTheDocument();
      expect(within(form).getByText("La contraseña es demasiado común.")).toBeInTheDocument();
      expect(within(form).getByLabelText(/correo institucional/i)).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("keeps the button focused but unavailable while the account is being created", async () => {
      await renderWith(pageOf([]));
      const form = await openCreator();
      createUserMock.mockReturnValue(new Promise(() => {}));

      fillNewUser(form);
      const submit = within(form).getByRole("button", { name: "Crear usuario" });
      submit.focus();
      fireEvent.click(submit);

      expect(await within(form).findByRole("button", { name: "Creando…" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(submit).toHaveFocus();
      fireEvent.click(submit);
      fireEvent.submit(form.querySelector("form")!);
      expect(createUserMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("editing a user", () => {
    it("opens the selected user with their current data", async () => {
      await renderWith(pageOf([LUIS]));

      const form = await openEditor(LUIS.email);

      expect(within(form).getByText(LUIS.email)).toBeInTheDocument();
      expect(within(form).getByLabelText("Nombre")).toHaveValue("Luis");
      expect(within(form).getByLabelText("Apellido")).toHaveValue("Gómez");
      expect(within(form).getByLabelText("Docente")).toBeChecked();
      expect(within(form).getByLabelText("Estudiante")).not.toBeChecked();
    });

    it("saves the names and the roles, then refreshes the list", async () => {
      await renderWith(pageOf([LUIS]));
      const form = await openEditor(LUIS.email);
      const updated = { ...LUIS, first_name: "Luis Carlos", roles: ["TEACHER", "ADMIN"] as const };
      updateUserMock.mockResolvedValue({ ...LUIS, first_name: "Luis Carlos" });
      setUserRolesMock.mockResolvedValue({ ...updated, roles: [...updated.roles] });
      listUsersMock.mockResolvedValue(pageOf([{ ...updated, roles: [...updated.roles] }]));

      fill(form, "Nombre", "Luis Carlos");
      fireEvent.click(within(form).getByLabelText("Administrador"));
      fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Se guardaron los cambios de luis.gomez@unal.edu.co.",
      );
      expect(updateUserMock).toHaveBeenCalledWith(LUIS.id, {
        first_name: "Luis Carlos",
        last_name: "Gómez",
      });
      expect(setUserRolesMock).toHaveBeenCalledWith(LUIS.id, ["TEACHER", "ADMIN"]);
      expect(await screen.findByText("Luis Carlos Gómez")).toBeInTheDocument();
      expect(listUsersMock).toHaveBeenCalledTimes(2);
    });

    it("only calls the endpoints whose data changed", async () => {
      await renderWith(pageOf([LUIS]));
      const form = await openEditor(LUIS.email);
      setUserRolesMock.mockResolvedValue({ ...LUIS, roles: ["STUDENT", "TEACHER"] });

      fireEvent.click(within(form).getByLabelText("Estudiante"));
      fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

      await screen.findByRole("status");
      expect(setUserRolesMock).toHaveBeenCalledWith(LUIS.id, ["STUDENT", "TEACHER"]);
      expect(updateUserMock).not.toHaveBeenCalled();
    });

    it("shows the API's reason when a change is refused", async () => {
      await renderWith(pageOf([LUIS]));
      const form = await openEditor(LUIS.email);
      const detail = "El sistema debe conservar al menos un administrador activo.";
      setUserRolesMock.mockRejectedValue(new ApiError(400, detail, { detail }));

      fireEvent.click(within(form).getByLabelText("Estudiante"));
      fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

      expect(await within(form).findByRole("alert")).toHaveTextContent(detail);
      expect(panel("Editar usuario")).toBeInTheDocument();
    });

    it("keeps at least one role selected", async () => {
      await renderWith(pageOf([LUIS]));
      const form = await openEditor(LUIS.email);

      fireEvent.click(within(form).getByLabelText("Docente"));
      fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

      expect(await within(form).findByText("Selecciona al menos un rol.")).toBeInTheDocument();
      expect(setUserRolesMock).not.toHaveBeenCalled();
    });
  });

  describe("deactivating and reactivating", () => {
    it("shows the impact first and deactivates only after confirming", async () => {
      await renderWith(pageOf([LUIS]));
      const form = await openEditor(LUIS.email);
      deactivateUserMock.mockResolvedValueOnce({
        deactivated: false,
        impact: { future_reservations: 2 },
        user: LUIS,
      });

      fireEvent.click(within(form).getByRole("button", { name: "Desactivar cuenta" }));

      expect(await within(form).findByText(/tiene 2 reservas futuras/)).toBeInTheDocument();
      expect(deactivateUserMock).toHaveBeenCalledWith(LUIS.id, { confirm: false });

      const inactive = { ...LUIS, is_active: false };
      deactivateUserMock.mockResolvedValueOnce({
        deactivated: true,
        impact: { future_reservations: 2 },
        user: inactive,
      });
      listUsersMock.mockResolvedValue(pageOf([inactive]));
      fireEvent.click(within(form).getByRole("button", { name: "Confirmar desactivación" }));

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Se desactivó la cuenta de luis.gomez@unal.edu.co.",
      );
      expect(deactivateUserMock).toHaveBeenLastCalledWith(LUIS.id, { confirm: true });
      expect(await screen.findByText("Inactiva")).toBeInTheDocument();
    });

    it("lets the person back out after seeing the impact", async () => {
      await renderWith(pageOf([LUIS]));
      const form = await openEditor(LUIS.email);
      deactivateUserMock.mockResolvedValue({
        deactivated: false,
        impact: { future_reservations: 0 },
        user: LUIS,
      });

      fireEvent.click(within(form).getByRole("button", { name: "Desactivar cuenta" }));
      await within(form).findByText(/no tiene reservas futuras/);
      fireEvent.click(within(form).getByRole("button", { name: "Cancelar" }));

      expect(within(form).getByRole("button", { name: "Desactivar cuenta" })).toBeInTheDocument();
      expect(deactivateUserMock).toHaveBeenCalledTimes(1);
    });

    it("shows the API's reason when the deactivation is refused", async () => {
      await renderWith(pageOf([LUIS]));
      const form = await openEditor(LUIS.email);
      const detail = "No puedes desactivar tu propia cuenta.";
      deactivateUserMock
        .mockResolvedValueOnce({ deactivated: false, impact: { future_reservations: 0 }, user: LUIS })
        .mockRejectedValueOnce(new ApiError(400, detail, { detail }));

      fireEvent.click(within(form).getByRole("button", { name: "Desactivar cuenta" }));
      fireEvent.click(await within(form).findByRole("button", { name: "Confirmar desactivación" }));

      expect(await within(form).findByRole("alert")).toHaveTextContent(detail);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("reactivates an inactive account", async () => {
      await renderWith(pageOf([MARTA]));
      const form = await openEditor(MARTA.email);
      updateUserMock.mockResolvedValue({ ...MARTA, is_active: true });
      listUsersMock.mockResolvedValue(pageOf([{ ...MARTA, is_active: true }]));

      expect(within(form).queryByRole("button", { name: "Desactivar cuenta" })).toBeNull();
      fireEvent.click(within(form).getByRole("button", { name: "Reactivar cuenta" }));

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Se reactivó la cuenta de marta.ruiz@unal.edu.co.",
      );
      expect(updateUserMock).toHaveBeenCalledWith(MARTA.id, { is_active: true });
      expect(await screen.findByText("Activa")).toBeInTheDocument();
    });
  });

  describe("the side panel", () => {
    it("closes with Escape and gives focus back to what opened it", async () => {
      await renderWith(pageOf([LUIS]));
      const opener = screen.getByRole("button", { name: "Nuevo usuario" });
      opener.focus();
      fireEvent.click(opener);
      const dialog = panel("Nuevo usuario");

      fireEvent.keyDown(dialog, { key: "Escape" });

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(opener).toHaveFocus();
    });

    it("closes with its close button", async () => {
      await renderWith(pageOf([LUIS]));
      const form = await openEditor(LUIS.email);

      fireEvent.click(within(form).getByRole("button", { name: "Cerrar panel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(rowButton(LUIS.email)).toHaveFocus();
    });

    it("stays locked while a save is pending", async () => {
      await renderWith(pageOf([LUIS, MARTA]));
      const form = await openEditor(LUIS.email);
      updateUserMock.mockReturnValue(new Promise(() => {}));

      fill(form, "Nombre", "Luis Carlos");
      const save = within(form).getByRole("button", { name: "Guardar cambios" });
      save.focus();
      fireEvent.click(save);
      await within(form).findByRole("button", { name: "Guardando…" });

      expect(save).toHaveAttribute("aria-disabled", "true");
      expect(save).toHaveFocus();
      fireEvent.click(save);
      fireEvent.submit(form.querySelector("form")!);
      expect(updateUserMock).toHaveBeenCalledTimes(1);

      expect(within(form).getByRole("button", { name: "Cerrar panel" })).toBeDisabled();
      expect(within(form).getByRole("button", { name: "Desactivar cuenta" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Nuevo usuario" })).toBeDisabled();
      fireEvent.keyDown(form, { key: "Escape" });
      fireEvent.click(rowButton(MARTA.email));
      expect(panel("Editar usuario")).toHaveTextContent(LUIS.email);
      expect(within(form).getByLabelText("Nombre")).toHaveValue("Luis Carlos");
    });

    it("reloads the current page once a pending save resolves", async () => {
      await renderWith(pageOf([LUIS], { count: 45, next: "http://api.test/api/v1/users/?page=2" }));
      const form = await openEditor(LUIS.email);
      let resolveSave: (user: AdminUser) => void = () => {};
      updateUserMock.mockReturnValue(new Promise((resolve) => (resolveSave = resolve)));

      fill(form, "Nombre", "Luis Carlos");
      fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));
      await within(form).findByRole("button", { name: "Guardando…" });
      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      resolveSave({ ...LUIS, first_name: "Luis Carlos" });

      expect(await screen.findByRole("status")).toBeInTheDocument();
      await waitFor(() => expect(listUsersMock).toHaveBeenCalledTimes(2));
      expect(listUsersMock.mock.calls.map(([page]) => page)).toEqual([1, 1]);
      expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
    });

    it("moves focus into the panel when it opens", async () => {
      await renderWith(pageOf([LUIS]));

      const form = await openEditor(LUIS.email);

      expect(within(form).getByRole("heading", { name: "Editar usuario" })).toHaveFocus();
    });
  });

  describe("the editing drawer", () => {
    it("is a modal dialog over the list", async () => {
      await renderWith(pageOf([LUIS]));

      const form = await openEditor(LUIS.email);

      expect(form).toHaveAttribute("aria-modal", "true");
      expect(document.body.style.overflow).toBe("hidden");
    });

    it("closes from the scrim and releases the page scroll", async () => {
      await renderWith(pageOf([LUIS]));
      await openEditor(LUIS.email);

      fireEvent.click(screen.getByTestId("drawer-scrim"));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe("");
      expect(rowButton(LUIS.email)).toHaveFocus();
    });

    it("keeps keyboard focus inside while it is open", async () => {
      await renderWith(pageOf([LUIS]));
      const form = await openEditor(LUIS.email);
      const close = within(form).getByRole("button", { name: "Cerrar panel" });
      const last = within(form).getByRole("button", { name: "Desactivar cuenta" });

      last.focus();
      fireEvent.keyDown(last, { key: "Tab" });
      expect(close).toHaveFocus();

      fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
      expect(last).toHaveFocus();
    });

    it("ignores the scrim while a save is pending", async () => {
      await renderWith(pageOf([LUIS]));
      const form = await openEditor(LUIS.email);
      updateUserMock.mockReturnValue(new Promise(() => {}));

      fill(form, "Nombre", "Luis Carlos");
      fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));
      await within(form).findByRole("button", { name: "Guardando…" });
      fireEvent.click(screen.getByTestId("drawer-scrim"));

      expect(panel("Editar usuario")).toBeInTheDocument();
    });

    it("opens the create form when the page is reached from a shortcut", async () => {
      searchParams = new URLSearchParams("nuevo=1");
      await renderWith(pageOf([LUIS]));

      expect(panel("Nuevo usuario")).toBeInTheDocument();
      expect(replace).toHaveBeenCalledWith("/admin/usuarios", { scroll: false });
    });
  });

  describe("filters", () => {
    it("searches by name or email once the person stops typing", async () => {
      await renderWith(pageOf([LUIS, MARTA]));
      listUsersMock.mockResolvedValue(pageOf([LUIS]));

      fireEvent.change(screen.getByRole("searchbox", { name: "Buscar usuarios" }), {
        target: { value: "luis" },
      });
      expect(listUsersMock).toHaveBeenCalledTimes(1);

      await waitFor(() =>
        expect(listUsersMock).toHaveBeenLastCalledWith(
          1,
          { ...NO_FILTERS, search: "luis" },
          expect.any(AbortSignal),
        ),
      );
      expect(await screen.findByText("1 usuario")).toBeInTheDocument();
      expect(replace).toHaveBeenLastCalledWith("/admin/usuarios?q=luis", { scroll: false });
    });

    it("clears the search from its clear button", async () => {
      searchParams = new URLSearchParams("q=luis");
      await renderWith(pageOf([LUIS]));
      expect(listUsersMock).toHaveBeenCalledWith(
        1,
        { ...NO_FILTERS, search: "luis" },
        expect.any(AbortSignal),
      );

      fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));

      expect(screen.getByRole("searchbox", { name: "Buscar usuarios" })).toHaveValue("");
      await waitFor(() =>
        expect(listUsersMock).toHaveBeenLastCalledWith(1, NO_FILTERS, expect.any(AbortSignal)),
      );
    });

    it("filters by role and by status, going back to the first page", async () => {
      await renderWith(pageOf([LUIS], { count: 45, next: "http://api.test/api/v1/users/?page=2" }));
      listUsersMock.mockResolvedValue(
        pageOf([LUIS], { count: 45, previous: "http://api.test/api/v1/users/" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      await screen.findByText("Página 2 de 3");

      fireEvent.change(screen.getByRole("combobox", { name: "Rol" }), {
        target: { value: "TEACHER" },
      });
      fireEvent.change(screen.getByRole("combobox", { name: "Estado" }), {
        target: { value: "inactivas" },
      });

      await waitFor(() =>
        expect(listUsersMock).toHaveBeenLastCalledWith(
          1,
          { search: "", role: "TEACHER", isActive: false },
          expect.any(AbortSignal),
        ),
      );
      expect(replace).toHaveBeenLastCalledWith("/admin/usuarios?rol=TEACHER&estado=inactivas", {
        scroll: false,
      });
    });

    it("starts from the filters in the URL", async () => {
      searchParams = new URLSearchParams("rol=ADMIN&estado=activas");
      await renderWith(pageOf([LUIS]));

      expect(screen.getByRole("combobox", { name: "Rol" })).toHaveValue("ADMIN");
      expect(screen.getByRole("combobox", { name: "Estado" })).toHaveValue("activas");
      expect(listUsersMock).toHaveBeenCalledWith(
        1,
        { search: "", role: "ADMIN", isActive: true },
        expect.any(AbortSignal),
      );
    });

    it("ignores a slower answer to a filter that is no longer in use", async () => {
      await renderWith(pageOf([LUIS, MARTA]));
      const signals: AbortSignal[] = [];
      listUsersMock.mockImplementation((_page, _filters, signal) => {
        signals.push(signal!);
        return new Promise(() => {});
      });

      fireEvent.change(screen.getByRole("combobox", { name: "Rol" }), {
        target: { value: "TEACHER" },
      });
      await waitFor(() => expect(signals).toHaveLength(1));
      fireEvent.change(screen.getByRole("combobox", { name: "Rol" }), {
        target: { value: "ADMIN" },
      });
      await waitFor(() => expect(signals).toHaveLength(2));

      expect(signals[0]!.aborted).toBe(true);
      expect(signals[1]!.aborted).toBe(false);
    });

    it("offers to clear the filters when nothing matches", async () => {
      searchParams = new URLSearchParams("estado=inactivas");
      await renderWith(pageOf([]));

      expect(screen.getByText("Ningún usuario coincide con los filtros.")).toBeInTheDocument();
      listUsersMock.mockResolvedValue(pageOf([LUIS]));
      fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

      await waitFor(() =>
        expect(listUsersMock).toHaveBeenLastCalledWith(1, NO_FILTERS, expect.any(AbortSignal)),
      );
      expect(screen.getByRole("combobox", { name: "Estado" })).toHaveValue("");
    });
  });

  describe("exporting", () => {
    it("downloads the users that match the current filters", async () => {
      searchParams = new URLSearchParams("rol=MONITOR&q=marta");
      await renderWith(pageOf([MARTA]));
      const blob = new Blob(["xlsx"]);
      let finish: (file: { blob: Blob; filename: string }) => void = () => {};
      exportUsersMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));

      const exportButton = screen.getByRole("button", { name: "Descargar Excel" });
      exportButton.focus();
      fireEvent.click(exportButton);

      expect(await screen.findByRole("button", { name: "Descargando…" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(exportButton).toHaveFocus();
      fireEvent.click(exportButton);
      expect(exportUsersMock).toHaveBeenCalledTimes(1);
      expect(exportUsersMock).toHaveBeenCalledWith({
        search: "marta",
        role: "MONITOR",
        isActive: null,
      });
      finish({ blob, filename: "usuarios.xlsx" });
      await waitFor(() => expect(saveFileMock).toHaveBeenCalledWith(blob, "usuarios.xlsx"));
      expect(screen.getByRole("button", { name: "Descargar Excel" })).not.toHaveAttribute(
        "aria-disabled",
      );
    });

    it("explains a failed export", async () => {
      await renderWith(pageOf([LUIS]));
      exportUsersMock.mockRejectedValue(new ApiError(0, "Network error"));

      fireEvent.click(screen.getByRole("button", { name: "Descargar Excel" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar");
      expect(saveFileMock).not.toHaveBeenCalled();
    });
  });
});
