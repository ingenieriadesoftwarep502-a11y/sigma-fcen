import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetCsrfToken } from "@/lib/api-client";
import {
  addVideo,
  documentFamily,
  extensionOf,
  fileProblem,
  formatFileSize,
  listMaterials,
  listUploadableSubjects,
  MAX_FILE_BYTES,
  removeMaterial,
  titleFromFileName,
  uploadDocument,
  youtubeEmbedUrl,
  youtubeIdFrom,
} from "@/lib/materials";

const BASE_URL = "http://api.test/api/v1";
const CSRF_URL = `${BASE_URL}/auth/csrf/`;
const VIDEO_ID = "dQw4w9WgXcQ";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fileOf(name: string, size = 10): File {
  return new File([new Uint8Array(size)], name);
}

describe("materials API (FASE-07)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  function respond(body: unknown, status = 200) {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        url === CSRF_URL ? jsonResponse({ csrfToken: "token" }) : jsonResponse(body, status),
      ),
    );
  }

  function onlyCall(): [string, RequestInit] {
    const calls = fetchMock.mock.calls.filter(([url]) => url !== CSRF_URL);
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0]!;
    return [String(url), init ?? {}];
  }

  beforeEach(() => {
    forgetCsrfToken();
    vi.stubEnv("NEXT_PUBLIC_API_URL", BASE_URL);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("lists one kind of material of a subject", async () => {
    respond({ count: 0, next: null, previous: null, results: [] });

    await listMaterials(7, "VIDEO", 2);

    const [url] = onlyCall();
    expect(url).toBe(`${BASE_URL}/materials/?subject=7&kind=VIDEO&page=2&page_size=50`);
  });

  it("lists the subjects the person may upload to", async () => {
    respond([]);

    await expect(listUploadableSubjects()).resolves.toEqual([]);
    expect(onlyCall()[0]).toBe(`${BASE_URL}/materials/subjects/`);
  });

  it("uploads a document as multipart, letting the browser set the boundary", async () => {
    respond({ id: "m-1" }, 201);
    const file = fileOf("Taller 1.pdf");

    await uploadDocument({ subjectId: 7, title: " Taller 1 ", description: "", file });

    const [url, init] = onlyCall();
    expect(url).toBe(`${BASE_URL}/materials/`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("subject_id")).toBe("7");
    expect(form.get("kind")).toBe("DOCUMENT");
    expect(form.get("title")).toBe("Taller 1");
    expect((form.get("file") as File).name).toBe("Taller 1.pdf");
  });

  it("adds a video as JSON", async () => {
    respond({ id: "m-2" }, 201);

    await addVideo({
      subjectId: 7,
      title: "Clase 1",
      description: " Límites ",
      videoUrl: ` https://youtu.be/${VIDEO_ID} `,
    });

    const [, init] = onlyCall();
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({
      subject_id: 7,
      kind: "VIDEO",
      title: "Clase 1",
      description: "Límites",
      video_url: `https://youtu.be/${VIDEO_ID}`,
    });
  });

  it("removes material", async () => {
    respond(null, 204);

    await removeMaterial("m-1");

    const [url, init] = onlyCall();
    expect(url).toBe(`${BASE_URL}/materials/m-1/`);
    expect(init.method).toBe("DELETE");
  });
});

describe("files", () => {
  it("reads the extension in lower case", () => {
    expect(extensionOf("Clase.PDF")).toBe("pdf");
    expect(extensionOf("C:\\x\\notas.tar.gz")).toBe("gz");
    expect(extensionOf("LEEME")).toBe("");
  });

  it("guesses a title from the file name", () => {
    expect(titleFromFileName("Taller_3  derivadas.pdf")).toBe("Taller 3 derivadas");
    expect(titleFromFileName("LEEME")).toBe("LEEME");
  });

  it.each([
    ["virus.exe", 10, "ejecutables"],
    ["pagina.html", 10, "ejecutables"],
    ["LEEME", 10, "extensión"],
    ["vacio.pdf", 0, "vacío"],
    ["grande.pdf", MAX_FILE_BYTES + 1, "el máximo es 20 MB"],
  ])("refuses %s before sending it", (name, size, message) => {
    expect(fileProblem(fileOf(name, size))).toContain(message);
  });

  it.each(["parcial.pdf", "datos.csv", "modelo.ipynb", "codigo.zip", "script.R"])(
    "accepts %s",
    (name) => {
      expect(fileProblem(fileOf(name))).toBeNull();
    },
  );

  it("formats sizes", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(840 * 1024)).toBe("840 KB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1,5 MB");
  });

  it("groups documents by family", () => {
    expect(documentFamily("pdf")).toBe("pdf");
    expect(documentFamily("PPTX")).toBe("slides");
    expect(documentFamily("ipynb")).toBe("code");
    expect(documentFamily("xyz")).toBe("other");
    expect(documentFamily(null)).toBe("other");
  });
});

describe("YouTube links", () => {
  it.each([
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    `https://m.youtube.com/watch?feature=share&v=${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}?si=abc`,
    `https://www.youtube.com/embed/${VIDEO_ID}`,
    `https://www.youtube.com/shorts/${VIDEO_ID}`,
    `www.youtube.com/watch?v=${VIDEO_ID}`,
  ])("reads the id of %s", (link) => {
    expect(youtubeIdFrom(link)).toBe(VIDEO_ID);
  });

  it.each([
    "",
    "https://vimeo.com/1",
    `https://youtube.com.evil.com/watch?v=${VIDEO_ID}`,
    "javascript:alert(1)",
    "https://www.youtube.com/watch?v=short",
  ])("rejects %s", (link) => {
    expect(youtubeIdFrom(link)).toBeNull();
  });

  it("embeds without cookies", () => {
    expect(youtubeEmbedUrl(VIDEO_ID)).toBe(
      `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?rel=0`,
    );
  });
});
