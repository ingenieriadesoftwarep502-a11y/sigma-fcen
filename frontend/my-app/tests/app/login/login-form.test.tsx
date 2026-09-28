import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LoginForm from "@/app/login/login-form";
import { ApiError } from "@/lib/api-client";
import { login } from "@/lib/auth";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/auth", () => ({ login: vi.fn() }));

const loginMock = vi.mocked(login);

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
}

describe("LoginForm (T-01.14)", () => {
  beforeEach(() => {
    render(<LoginForm />);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("asks for the institutional email and the password", () => {
    expect(screen.getByLabelText(/correo institucional/i)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/contraseña/i)).toHaveAttribute("type", "password");
    expect(screen.getByRole("link", { name: /crear una cuenta/i })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("requires both fields before calling the API", async () => {
    submit();

    expect(await screen.findByText("Ingresa tu correo.")).toBeInTheDocument();
    expect(screen.getByText("Ingresa tu contraseña.")).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("logs in and goes to the home page", async () => {
    loginMock.mockResolvedValue({
      id: "1",
      email: "ana.perez@unal.edu.co",
      first_name: "Ana",
      last_name: "Pérez",
      roles: ["STUDENT"],
    });
    fill(/correo institucional/i, "ana.perez@unal.edu.co");
    fill(/contraseña/i, "Str0ng-Passw0rd!");

    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(loginMock).toHaveBeenCalledWith("ana.perez@unal.edu.co", "Str0ng-Passw0rd!");
  });

  it("shows the API message when the credentials are rejected", async () => {
    const detail = "Correo o contraseña incorrectos.";
    loginMock.mockRejectedValue(new ApiError(401, detail, { detail }));
    fill(/correo institucional/i, "ana.perez@unal.edu.co");
    fill(/contraseña/i, "wrong");

    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos.");
    expect(push).not.toHaveBeenCalled();
  });

  it("explains when the server cannot be reached", async () => {
    loginMock.mockRejectedValue(new ApiError(0, "Network error"));
    fill(/correo institucional/i, "ana.perez@unal.edu.co");
    fill(/contraseña/i, "Str0ng-Passw0rd!");

    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos conectar con el servidor. Intenta de nuevo.",
    );
  });

  it("disables the button while the request is in flight", async () => {
    loginMock.mockReturnValue(new Promise(() => {}));
    fill(/correo institucional/i, "ana.perez@unal.edu.co");
    fill(/contraseña/i, "Str0ng-Passw0rd!");

    submit();

    expect(await screen.findByRole("button", { name: "Ingresando…" })).toBeDisabled();
  });
});
