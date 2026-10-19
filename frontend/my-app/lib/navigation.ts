/**
 * Sections of the signed-in app, in sidebar order. A new section is one more entry;
 * `roles` hides it from everyone else (the API still enforces access on its own).
 */

import type { IconName } from "@/components/ui/icon";
import {
  CATALOG_ADMIN_PATH,
  HOME_PATH,
  MY_COURSES_PATH,
  MY_MONITORING_PATH,
  type RoleCode,
  SUBJECTS_PATH,
  USERS_ADMIN_PATH,
} from "@/lib/auth";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** When set, only people holding at least one of these roles see the entry. */
  roles?: readonly RoleCode[];
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: HOME_PATH, label: "Inicio", icon: "home" },
  { href: SUBJECTS_PATH, label: "Asignaturas", icon: "book", roles: ["STUDENT"] },
  { href: MY_MONITORING_PATH, label: "Mis monitorías", icon: "support", roles: ["MONITOR"] },
  { href: MY_COURSES_PATH, label: "Mis cursos", icon: "courses", roles: ["TEACHER"] },
  { href: CATALOG_ADMIN_PATH, label: "Catálogo", icon: "catalog", roles: ["ADMIN"] },
  { href: USERS_ADMIN_PATH, label: "Usuarios", icon: "users", roles: ["ADMIN"] },
];

export function navItemsFor(roles: readonly RoleCode[]): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.some((role) => roles.includes(role)));
}

/** A section is current on its own path and on any path below it. */
export function isCurrentSection(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
