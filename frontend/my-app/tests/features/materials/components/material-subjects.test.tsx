import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MaterialSubjects from "@/features/materials/components/material-subjects";
import MaterialWorkspace from "@/features/materials/components/material-workspace";
import { listMaterials, listUploadableSubjects } from "@/lib/materials";

import { pageOf } from "../../availability/fixtures";
import { UPLOADABLE } from "../fixtures";

vi.mock("@/lib/materials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/materials")>()),
  listUploadableSubjects: vi.fn(),
  listMaterials: vi.fn(),
}));

const subjectsMock = vi.mocked(listUploadableSubjects);

describe("MaterialSubjects (FASE-07)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists the subjects the person may upload to, each a way into its repository", async () => {
    subjectsMock.mockResolvedValue([
      UPLOADABLE,
      { ...UPLOADABLE, id: 2, code: "1000003", name: "Álgebra lineal", roles: ["TEACHER"], document_count: 1, video_count: 0 },
    ]);
    render(<MaterialSubjects />);

    const list = await screen.findByRole("list", {
      name: "Asignaturas donde puedes subir material",
    });
    const calculo = within(list).getByRole("link", { name: "Material de Cálculo diferencial" });
    expect(calculo).toHaveAttribute("href", "/material/1");
    expect(within(calculo).getByText("Monitor")).toBeInTheDocument();
    expect(within(calculo).getByText("3 documentos")).toBeInTheDocument();
    expect(within(calculo).getByText("1 video")).toBeInTheDocument();
    const algebra = within(list).getByRole("link", { name: "Material de Álgebra lineal" });
    expect(within(algebra).getByText("Docente")).toBeInTheDocument();
    expect(within(algebra).getByText("1 documento")).toBeInTheDocument();
  });

  it("explains why there is nothing to choose", async () => {
    subjectsMock.mockResolvedValue([]);
    render(<MaterialSubjects />);

    expect(
      await screen.findByText("No tienes asignaturas para subir material en este período."),
    ).toBeInTheDocument();
  });
});

describe("MaterialWorkspace (FASE-07)", () => {
  beforeEach(() => {
    vi.mocked(listMaterials).mockResolvedValue(pageOf([]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("names the subject and offers the uploads into it", async () => {
    subjectsMock.mockResolvedValue([UPLOADABLE]);
    render(<MaterialWorkspace subjectId={1} />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Cálculo diferencial" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Estás publicando como monitor de esta asignatura/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Subir documento/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agregar video/ })).toBeInTheDocument();
  });

  it("refuses a subject the person does not monitor nor teach", async () => {
    subjectsMock.mockResolvedValue([UPLOADABLE]);
    render(<MaterialWorkspace subjectId={9} />);

    expect(
      await screen.findByText("No puedes subir material a esta asignatura."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Subir documento/ })).not.toBeInTheDocument();
    expect(listMaterials).not.toHaveBeenCalled();
  });
});
