import type { Material, UploadableSubject } from "@/lib/materials";

export const SUBJECT = { id: 1, code: "1000004", name: "Cálculo diferencial" };
export const VIDEO_ID = "dQw4w9WgXcQ";

const BASE: Material = {
  id: "d-1",
  subject: SUBJECT,
  kind: "DOCUMENT",
  title: "Taller 1",
  description: "",
  uploaded_by: { id: "m-1", full_name: "Sofía Díaz" },
  created_at: "2026-10-18T15:00:00Z",
  file_name: "Taller 1.pdf",
  file_extension: "pdf",
  content_type: "application/pdf",
  size_bytes: 820 * 1024,
  youtube_id: null,
  can_delete: false,
};

export function documentOf(overrides: Partial<Material> = {}): Material {
  return { ...BASE, ...overrides };
}

export function videoOf(overrides: Partial<Material> = {}): Material {
  return {
    ...BASE,
    id: "v-1",
    kind: "VIDEO",
    title: "Clase grabada",
    file_name: null,
    file_extension: null,
    content_type: null,
    size_bytes: null,
    youtube_id: VIDEO_ID,
    ...overrides,
  };
}

export const UPLOADABLE: UploadableSubject = {
  ...SUBJECT,
  department: "Matemáticas",
  roles: ["MONITOR"],
  document_count: 3,
  video_count: 1,
};
