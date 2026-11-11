/** How the interface names a person and summarizes their roles. */

import { ROLE_CODES, type RoleCode } from "@/lib/auth";

type Person = { first_name: string; last_name: string; email: string };

/** Roles from the widest reach to the narrowest; the first one held is the primary role. */
const ROLE_PRECEDENCE: readonly RoleCode[] = [...ROLE_CODES].reverse();

export function displayName({ first_name, last_name, email }: Person): string {
  return `${first_name.trim()} ${last_name.trim()}`.trim() || email;
}

/** Up to two letters for an avatar: first and last name, or the start of the email. */
export function initialsOf(person: Person): string {
  const words = `${person.first_name} ${person.last_name}`.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length === 0
      ? [person.email]
      : words.length === 1
        ? [words[0]!]
        : [words[0]!, words[words.length - 1]!];
  return letters.map((word) => word.charAt(0).toLocaleUpperCase("es")).join("");
}

/** Initials for a person the API names only by `full_name` (e.g. a monitor or a teacher). */
export function initialsOfFullName(fullName: string, email: string): string {
  return initialsOf({ first_name: fullName, last_name: "", email });
}

export function primaryRole(roles: readonly RoleCode[]): RoleCode | null {
  return ROLE_PRECEDENCE.find((role) => roles.includes(role)) ?? null;
}
