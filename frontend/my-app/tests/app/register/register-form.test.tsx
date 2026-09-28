import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RegisterForm from "@/app/register/register-form";
import { ApiError } from "@/lib/api-client";
import { login, register } from "@/lib/auth";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  login: vi.fn(),
  register: vi.fn(),
}));

const registerMock = vi.mocked(register);
const loginMock = vi.mocked(login);

const USER = {
  id: "1",
  email: "ana.perez@unal.edu.co",
  first_name: "Ana",
  last_name: "Pérez",
  roles: ["STUDENT" as const],
};

function fillValidForm(email = "ana.perez@unal.edu.co") {
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ana" } });
  fireEvent.change(screen.getByLabelText("Apellido"), { target: { value: "Pérez" } });
  fireEvent.change(screen.getByLabelText(/correo institucional/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: "Str0ng-Passw0rd!" },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
}

describe("RegisterForm (T-01.14, HU-01)", () => {
  beforeEach(() => {
    render(<RegisterForm />);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("asks for names, institutional email and password, and links to login", () => {
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Apellido")).toBeInTheDocument();
    expect(screen.getByLabelText(/correo institucional/i)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
    expect(screen.getByRole("link", { name: /iniciar sesión/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("requires every field before calling the API", async () => {
    submit();

    expect(await screen.findByText("Ingresa tu nombre.")).toBeInTheDocument();
    expect(screen.getByText("Ingresa tu apellido.")).toBeInTheDocument();
    expect(screen.getByText("Ingresa tu correo.")).toBeInTheDocument();
    expect(screen.getByText("Ingresa una contraseña.")).toBeInTheDocument();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("rejects a non-institutional email before calling the API (CA-HU01-3)", async () => {
    fillValidForm("ana@gmail.com");

    submit();

    expect(
      await screen.findByText("Usa tu correo institucional @unal.edu.co."),
    ).toBeInTheDocument();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("creates the account, signs in and goes to the home page (CA-HU01-1)", async () => {
    registerMock.mockResolvedValue(USER);
    loginMock.mockResolvedValue(USER);
    fillValidForm();

    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(registerMock).toHaveBeenCalledWith({
      email: "ana.perez@unal.edu.co",
      password: "Str0ng-Passw0rd!",
      first_name: "Ana",
      last_name: "Pérez",
    });
    expect(loginMock).toHaveBeenCalledWith("ana.perez@unal.edu.co", "Str0ng-Passw0rd!");
  });

  it("shows the server's field errors next to each field (CA-HU01-2, CA-HU01-4)", async () => {
    registerMock.mockRejectedValue(
      new ApiError(400, "Bad request", {
        email: ["Ya existe una cuenta con este correo."],
        password: ["This password is too common."],
      }),
    );
    fillValidForm();

    submit();

    expect(await screen.findByText("Ya existe una cuenta con este correo.")).toBeInTheDocument();
    expect(screen.getByText("This password is too common.")).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("explains when the server cannot be reached", async () => {
    registerMock.mockRejectedValue(new ApiError(0, "Network error"));
    fillValidForm();

    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos conectar con el servidor. Intenta de nuevo.",
    );
  });
});
