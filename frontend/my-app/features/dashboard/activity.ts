/** The audit feed told as plain Spanish sentences for the admin dashboard. */

import type { AuditEntry } from "@/lib/users";

type Reference = NonNullable<AuditEntry["actor"]>;

/** A sentence split into plain text and the people it names, so they can be emphasized. */
export type SentencePart = { text: string; person?: boolean };

const SYSTEM = "El sistema";
const MISSING_TARGET = "una persona eliminada";

/** What was done to someone else: the verb phrase before the target's name. */
const ON_OTHERS: Record<AuditEntry["action"], string> = {
  USER_CREATED: "creó la cuenta de",
  USER_UPDATED: "actualizó los datos de",
  USER_ACTIVATED: "reactivó la cuenta de",
  USER_DEACTIVATED: "desactivó la cuenta de",
  ROLES_CHANGED: "cambió los roles de",
};

/** What someone did to their own account. */
const ON_SELF: Record<AuditEntry["action"], string> = {
  USER_CREATED: "se registró",
  USER_UPDATED: "actualizó sus propios datos",
  USER_ACTIVATED: "reactivó su propia cuenta",
  USER_DEACTIVATED: "desactivó su propia cuenta",
  ROLES_CHANGED: "cambió sus propios roles",
};

function nameOf(reference: Reference): string {
  return reference.full_name.trim() || reference.email;
}

export function activityParts({ action, actor, target }: AuditEntry): SentencePart[] {
  const who: SentencePart = actor ? { text: nameOf(actor), person: true } : { text: SYSTEM };
  if (actor && target && actor.id === target.id) {
    return [who, { text: ` ${ON_SELF[action]}.` }];
  }
  const whom: SentencePart = target
    ? { text: nameOf(target), person: true }
    : { text: MISSING_TARGET };
  return [who, { text: ` ${ON_OTHERS[action]} ` }, whom, { text: "." }];
}

export function activitySentence(entry: AuditEntry): string {
  return activityParts(entry)
    .map((part) => part.text)
    .join("");
}
