"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Icon from "@/components/ui/icon";
import { useSession } from "@/features/auth/session/session-provider";
import { isCurrentSection, navItemsFor } from "@/lib/navigation";

import styles from "./app-navigation.module.css";

/** The sections the signed-in person may open, with the one in view marked as current. */
export default function AppNavigation() {
  const { session } = useSession();
  const pathname = usePathname();
  if (session.status !== "authenticated") return null;

  return (
    <ul className={styles.list}>
      {navItemsFor(session.user.roles).map((item) => {
        const current = isCurrentSection(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={styles.link}
              aria-current={current ? "page" : undefined}
            >
              <Icon name={item.icon} className={styles.icon} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
