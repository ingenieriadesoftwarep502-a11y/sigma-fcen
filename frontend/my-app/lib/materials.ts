/**
 * Study material endpoints (FASE-07): each subject has a repository of documents and YouTube
 * videos. Anyone signed in reads it; the monitor assigned to the subject and the teacher of
 * one of its courses add to it; the author or an administrator removes from it.
 *
 * ADR-012: any document is accepted except executables, up to 20 MB; videos are never
 * uploaded, they are YouTube links played inside the page. The server checks everything again:
 * the checks here only spare the person a useless upload.
 */

import { apiDownload, apiRequest, queryString } from "@/lib/api-client";
import { saveFile } from "@/lib/download";
import type { components } from "@/types/api";

type Schemas = components["schemas"];

export type Material = Schemas["Material"];
export type MaterialKind = Schemas["MaterialKindEnum"];
export type MaterialPage = Schemas["PaginatedMaterialList"];
export type UploadableSubject = Schemas["UploadableSubject"];

/** ADR-012, item 4. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TITLE_LENGTH = 150;
export const MAX_DESCRIPTION_LENGTH = 1000;

/** Uploads can take a while on a campus connection. */
const UPLOAD_TIMEOUT_MS = 180_000;

/** Programs and pages the server refuses (ADR-012, item 2); mirrors the backend list. */
const BLOCKED_EXTENSIONS = new Set([
  "apk", "app", "bat", "bin", "cgi", "cmd", "com", "cpl", "deb", "dll", "dmg", "elf", "exe",
  "gadget", "hta", "htm", "html", "inf", "ins", "jar", "js", "jse", "lnk", "mht", "mhtml",
  "mjs", "msc", "msi", "msp", "php", "pif", "ps1", "psm1", "reg", "rpm", "run", "scr", "sct",
  "sh", "shtml", "so", "svg", "svgz", "url", "vb", "vbe", "vbs", "ws", "wsc", "wsf", "wsh",
  "xhtml",
]);

export function listMaterials(
  subjectId: number,
  kind: MaterialKind,
  page: number,
  signal?: AbortSignal,
): Promise<MaterialPage> {
  return apiRequest<MaterialPage>(
    `/materials/${queryString({ subject: subjectId, kind, page, page_size: 50 })}`,
    { signal },
  );
}

/** The subjects the signed-in person may add material to; empty for everyone else. */
export function listUploadableSubjects(signal?: AbortSignal): Promise<UploadableSubject[]> {
  return apiRequest<UploadableSubject[]>("/materials/subjects/", { signal });
}

type NewMaterial = { subjectId: number; title: string; description: string };

export function uploadDocument({
  subjectId,
  title,
  description,
  file,
}: NewMaterial & { file: File }): Promise<Material> {
  const form = new FormData();
  form.set("subject_id", String(subjectId));
  form.set("kind", "DOCUMENT");
  form.set("title", title.trim());
  form.set("description", description.trim());
  form.set("file", file, file.name);
  return apiRequest<Material>("/materials/", {
    method: "POST",
    body: form,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
}

export function addVideo({
  subjectId,
  title,
  description,
  videoUrl,
}: NewMaterial & { videoUrl: string }): Promise<Material> {
  return apiRequest<Material>("/materials/", {
    method: "POST",
    body: {
      subject_id: subjectId,
      kind: "VIDEO",
      title: title.trim(),
      description: description.trim(),
      video_url: videoUrl.trim(),
    },
  });
}

export function removeMaterial(id: string): Promise<void> {
  return apiRequest<void>(`/materials/${id}/`, { method: "DELETE" });
}

/** Saves the document under the name it was uploaded with. */
export async function downloadMaterial(material: Material): Promise<void> {
  const { blob, filename } = await apiDownload(`/materials/${material.id}/download/`, {
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
  saveFile(blob, filename ?? material.file_name ?? "material");
}

// --- Files ---------------------------------------------------------------------------------

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 || (dot === 0 && base.length > 1) ? base.slice(dot + 1).trim().toLowerCase() : "";
}

/** The name without its extension, as a first guess for the title. */
export function titleFromFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
}

/** Why the server would refuse this file, or null when it is worth sending. */
export function fileProblem(file: File): string | null {
  const ext = extensionOf(file.name);
  if (!ext) return "El archivo debe tener una extensión, por ejemplo .pdf.";
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return `Por seguridad no se permiten programas ni archivos ejecutables (.${ext}).`;
  }
  if (file.size === 0) return "El archivo está vacío.";
  if (file.size > MAX_FILE_BYTES) {
    return `El archivo pesa ${formatFileSize(file.size)}; el máximo es ${formatFileSize(MAX_FILE_BYTES)}.`;
  }
  return null;
}

const sizeFormat = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/** e.g. "820 KB", "1,5 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${sizeFormat.format(bytes / (1024 * 1024))} MB`;
}

/** Families of documents, so a long repository can be narrowed by what each file is. */
export type DocumentFamily =
  | "pdf"
  | "text"
  | "slides"
  | "sheet"
  | "image"
  | "code"
  | "archive"
  | "other";

const FAMILY_EXTENSIONS: Record<Exclude<DocumentFamily, "other">, readonly string[]> = {
  pdf: ["pdf"],
  text: ["doc", "docx", "odt", "rtf", "txt", "md", "tex", "epub"],
  slides: ["ppt", "pptx", "odp", "key"],
  sheet: ["xls", "xlsx", "ods", "csv", "tsv"],
  image: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "heic"],
  code: ["py", "ipynb", "r", "m", "c", "cpp", "h", "java", "jl", "sql", "json", "ggb", "nb", "mat"],
  archive: ["zip", "rar", "7z", "tar", "gz", "tgz"],
};

export const FAMILY_LABELS: Record<DocumentFamily, string> = {
  pdf: "PDF",
  text: "Textos",
  slides: "Presentaciones",
  sheet: "Hojas de cálculo",
  image: "Imágenes",
  code: "Código y datos",
  archive: "Comprimidos",
  other: "Otros",
};

/** The order in which families are offered as filters. */
export const FAMILY_ORDER: readonly DocumentFamily[] = [
  "pdf",
  "text",
  "slides",
  "sheet",
  "image",
  "code",
  "archive",
  "other",
];

export function documentFamily(extension: string | null): DocumentFamily {
  const ext = (extension ?? "").toLowerCase();
  for (const [family, extensions] of Object.entries(FAMILY_EXTENSIONS)) {
    if (extensions.includes(ext)) return family as DocumentFamily;
  }
  return "other";
}

// --- YouTube -------------------------------------------------------------------------------

const YOUTUBE_HOSTS = new Set(["youtube.com", "youtube-nocookie.com", "youtu.be"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const ID_PATHS = new Set(["embed", "shorts", "live", "v"]);

/** The 11-character id of a YouTube video link, or null; mirrors the server's rule. */
export function youtubeIdFrom(link: string): string | null {
  let text = link.trim();
  if (!text) return null;
  if (!text.includes("://")) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  if (!["http:", "https:"].includes(url.protocol) || !YOUTUBE_HOSTS.has(host)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  let candidate = "";
  if (host === "youtu.be") candidate = segments[0] ?? "";
  else if (segments.length === 1 && segments[0] === "watch") candidate = url.searchParams.get("v") ?? "";
  else if (segments.length >= 2 && ID_PATHS.has(segments[0]!)) candidate = segments[1]!;
  return YOUTUBE_ID.test(candidate) ? candidate : null;
}

/** The privacy-enhanced player: YouTube sets no cookies until the video plays. */
export function youtubeEmbedUrl(id: string, autoplay = false): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0${autoplay ? "&autoplay=1" : ""}`;
}

export function youtubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
