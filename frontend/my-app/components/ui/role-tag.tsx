import { ROLE_LABELS, type RoleCode } from "@/lib/auth";

import styles from "./role-tag.module.css";

type RoleTagsProps = {
  roles: readonly RoleCode[];
};

/** A person's roles as tags, one hue per role (the same hues as the dashboard). */
export default function RoleTags({ roles }: RoleTagsProps) {
  return (
    <ul className={styles.tags}>
      {roles.map((role) => (
        <li key={role} className={styles.tag} data-role={role}>
          {ROLE_LABELS[role]}
        </li>
      ))}
    </ul>
  );
}
