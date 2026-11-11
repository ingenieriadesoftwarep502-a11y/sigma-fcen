import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MaterialLibrary from "@/features/materials/components/material-library";
import { ApiError } from "@/lib/api-client";
import {
  addVideo,
  downloadMaterial,
  listMaterials,
  type Material,
  type MaterialKind,
  removeMaterial,
  uploadDocument,
} from "@/lib/materials";

import { pageOf } from "../../availability/fixtures";
import { documentOf, SUBJECT, VIDEO_ID, videoOf } from "../fixtures";

vi.mock("@/lib/materials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/materials")>()),
  listMaterials: vi.fn(),
  uploadDocument: vi.fn(),
  addVideo: vi.fn(),
  removeMaterial: vi.fn(),
  downloadMaterial: vi.fn(),
}));

const listMock = vi.mocked(listMaterials);

function shelves(documents: Material[], videos: Material[]) {
  listMock.mockImplementation((_subject: number, kind: MaterialKind) =>
    Promise.resolve(pageOf(kind === "DOCUMENT" ? documents : videos)),
  );
}

function renderLibrary(canUpload = false) {
  render(
    <MaterialLibrary
      subject={SUBJECT}
      canUpload={canUpload}
      audience={canUpload ? "uploader" : "student"}
    />,
  );
}

function pdf(name = "Guía 2.pdf", size = 10) {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

describe("MaterialLibrary (FASE-07)", () => {
  beforeEach(() => {
    shelves(
      [
        documentOf(),
        documentOf({
          id: "d-2",
          title: "Presentación límites",
          file_name: "limites.pptx",
          file_extension: "pptx",
        }),
      ],
      [videoOf()],
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("separates documents from videos and counts each", async () => {
    renderLibrary();

    expect(await screen.findByRole("tab", { name: "Documentos · 2" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Videos · 1" })).toBeInTheDocument();
    expect(screen.getByText("2 documentos · 1 video")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Documentos de Cálculo diferencial" });
    const [first] = within(list).getAllByRole("listitem");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(first!).getByText("Taller 1.pdf")).toBeInTheDocument();
    expect(within(first!).getByText("820 KB")).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith(1, "DOCUMENT", 1, expect.any(AbortSignal));
    expect(listMock).toHaveBeenCalledWith(1, "VIDEO", 1, expect.any(AbortSignal));
  });

  it("lets students read but never upload nor remove", async () => {
    renderLibrary();

    await screen.findByText("Taller 1");
    expect(screen.queryByRole("button", { name: /Subir documento/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Agregar video/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retirar/ })).not.toBeInTheDocument();
  });

  it("narrows documents by what they are", async () => {
    renderLibrary();

    fireEvent.click(await screen.findByRole("button", { name: "Presentaciones" }));

    const list = screen.getByRole("list", { name: "Documentos de Cálculo diferencial" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("Presentación límites")).toBeInTheDocument();
  });

  it("downloads a document", async () => {
    renderLibrary();

    fireEvent.click(await screen.findByRole("button", { name: "Descargar Taller 1" }));

    await waitFor(() => expect(downloadMaterial).toHaveBeenCalledWith(documentOf()));
  });

  it("plays a video inside the page only when asked", async () => {
    renderLibrary();
    fireEvent.click(await screen.findByRole("tab", { name: "Videos · 1" }));

    const play = screen.getByRole("button", { name: "Reproducir Clase grabada" });
    expect(document.querySelector("iframe")).toBeNull();
    fireEvent.click(play);

    const player = screen.getByTitle("Clase grabada");
    expect(player.getAttribute("src")).toContain(`youtube-nocookie.com/embed/${VIDEO_ID}`);
    expect(screen.getByRole("link", { name: "Abrir Clase grabada en YouTube" })).toHaveAttribute(
      "href",
      `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    );
  });

  it("says when a subject has nothing yet", async () => {
    shelves([], []);
    renderLibrary();

    expect(
      await screen.findByText("Todavía no hay documentos en esta asignatura."),
    ).toBeInTheDocument();
  });

  it("offers a retry when the material cannot be read", async () => {
    listMock.mockRejectedValue(new ApiError(0, "down", { detail: "Sin conexión." }));
    renderLibrary();

    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexión.");
    expect(screen.getByRole("button", { name: /Intentar de nuevo/ })).toBeInTheDocument();
  });
});

describe("MaterialLibrary · uploading (FASE-07)", () => {
  beforeEach(() => {
    shelves([documentOf({ can_delete: true })], []);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uploads a document into this subject, saying where it goes", async () => {
    vi.mocked(uploadDocument).mockResolvedValue(documentOf({ id: "d-9", title: "Guía 2" }));
    renderLibrary(true);
    fireEvent.click(await screen.findByRole("button", { name: /Subir documento/ }));

    const dialog = screen.getByRole("dialog", { name: "Subir documento" });
    expect(within(dialog).getByText(/Se publicará en/)).toHaveTextContent(
      "Se publicará en Cálculo diferencial 1000004",
    );
    fireEvent.change(within(dialog).getByLabelText("Archivo"), {
      target: { files: [pdf()] },
    });
    expect(within(dialog).getByLabelText("Título")).toHaveValue("Guía 2");
    fireEvent.click(within(dialog).getByRole("button", { name: /Subir documento/ }));

    await waitFor(() =>
      expect(uploadDocument).toHaveBeenCalledWith({
        subjectId: 1,
        title: "Guía 2",
        description: "",
        file: expect.any(File),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "«Guía 2» quedó publicado en Documentos.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("refuses an executable before sending it", async () => {
    renderLibrary(true);
    fireEvent.click(await screen.findByRole("button", { name: /Subir documento/ }));
    const dialog = screen.getByRole("dialog", { name: "Subir documento" });

    fireEvent.change(within(dialog).getByLabelText("Archivo"), {
      target: { files: [pdf("instalador.exe")] },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Subir documento/ }));

    expect(within(dialog).getByText(/no se permiten programas/)).toBeInTheDocument();
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it("shows what the server answered when it refuses the file", async () => {
    vi.mocked(uploadDocument).mockRejectedValue(
      new ApiError(413, "too large", { detail: "El archivo supera el tamaño máximo de 20 MB." }),
    );
    renderLibrary(true);
    fireEvent.click(await screen.findByRole("button", { name: /Subir documento/ }));
    const dialog = screen.getByRole("dialog", { name: "Subir documento" });

    fireEvent.change(within(dialog).getByLabelText("Archivo"), { target: { files: [pdf()] } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Subir documento/ }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("20 MB");
  });

  it("adds a YouTube video with a preview and opens the Videos tab", async () => {
    vi.mocked(addVideo).mockResolvedValue(videoOf({ title: "Clase 5" }));
    renderLibrary(true);
    fireEvent.click(await screen.findByRole("button", { name: /Agregar video/ }));
    const dialog = screen.getByRole("dialog", { name: "Agregar video" });

    fireEvent.change(within(dialog).getByLabelText("Enlace de YouTube"), {
      target: { value: `https://youtu.be/${VIDEO_ID}` },
    });
    expect(within(dialog).getByRole("img", { name: "Vista previa del video" })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Título"), { target: { value: "Clase 5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Publicar video/ }));

    await waitFor(() =>
      expect(addVideo).toHaveBeenCalledWith({
        subjectId: 1,
        title: "Clase 5",
        description: "",
        videoUrl: `https://youtu.be/${VIDEO_ID}`,
      }),
    );
    expect(await screen.findByRole("tab", { name: /Videos/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("rejects a link that is not a YouTube video", async () => {
    renderLibrary(true);
    fireEvent.click(await screen.findByRole("button", { name: /Agregar video/ }));
    const dialog = screen.getByRole("dialog", { name: "Agregar video" });

    fireEvent.change(within(dialog).getByLabelText("Enlace de YouTube"), {
      target: { value: "https://vimeo.com/1" },
    });
    fireEvent.change(within(dialog).getByLabelText("Título"), { target: { value: "Clase" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Publicar video/ }));

    expect(within(dialog).getByText("Pega un enlace válido de un video de YouTube.")).toBeInTheDocument();
    expect(addVideo).not.toHaveBeenCalled();
  });

  it("removes material after a second confirmation", async () => {
    vi.mocked(removeMaterial).mockResolvedValue(undefined);
    renderLibrary(true);

    fireEvent.click(await screen.findByRole("button", { name: "Retirar Taller 1" }));
    expect(removeMaterial).not.toHaveBeenCalled();
    const confirm = screen.getByRole("group", { name: "Retirar Taller 1" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Retirar" }));

    await waitFor(() => expect(removeMaterial).toHaveBeenCalledWith("d-1"));
    expect(await screen.findByRole("status")).toHaveTextContent("Se retiró «Taller 1».");
  });
});
