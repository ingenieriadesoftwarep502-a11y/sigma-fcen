import { describe, expect, it } from "vitest";

import { activitySentence } from "@/features/dashboard/activity";
import type { AuditEntry } from "@/lib/users";

const ANA = { id: "a", email: "ana.perez@unal.edu.co", full_name: "Ana Pérez" };
const LUIS = { id: "l", email: "luis.gomez@unal.edu.co", full_name: "Luis Gómez" };

function entry(action: AuditEntry["action"], extra: Partial<AuditEntry> = {}): AuditEntry {
  return { id: 1, action, created_at: "2026-09-29T14:00:00Z", actor: ANA, target: LUIS, ...extra };
}

describe("activitySentence", () => {
  it("tells each action as a sentence", () => {
    expect(activitySentence(entry("USER_CREATED"))).toBe("Ana Pérez creó la cuenta de Luis Gómez.");
    expect(activitySentence(entry("USER_UPDATED"))).toBe(
      "Ana Pérez actualizó los datos de Luis Gómez.",
    );
    expect(activitySentence(entry("USER_ACTIVATED"))).toBe(
      "Ana Pérez reactivó la cuenta de Luis Gómez.",
    );
    expect(activitySentence(entry("USER_DEACTIVATED"))).toBe(
      "Ana Pérez desactivó la cuenta de Luis Gómez.",
    );
    expect(activitySentence(entry("ROLES_CHANGED"))).toBe(
      "Ana Pérez cambió los roles de Luis Gómez.",
    );
  });

  it("uses the email when a person has no name", () => {
    expect(activitySentence(entry("USER_CREATED", { actor: { ...ANA, full_name: "" } }))).toBe(
      "ana.perez@unal.edu.co creó la cuenta de Luis Gómez.",
    );
  });

  it("covers self-registration, self-edits and missing people", () => {
    expect(activitySentence(entry("USER_CREATED", { target: ANA }))).toBe("Ana Pérez se registró.");
    expect(activitySentence(entry("USER_UPDATED", { target: ANA }))).toBe(
      "Ana Pérez actualizó sus propios datos.",
    );
    expect(activitySentence(entry("USER_CREATED", { actor: null }))).toBe(
      "El sistema creó la cuenta de Luis Gómez.",
    );
    expect(activitySentence(entry("USER_DEACTIVATED", { target: null }))).toBe(
      "Ana Pérez desactivó la cuenta de una persona eliminada.",
    );
  });
});
