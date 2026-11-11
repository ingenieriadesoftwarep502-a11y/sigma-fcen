import { ROLE_CODES, ROLE_LABELS, type RoleCode } from "@/lib/auth";

import styles from "./user-form.module.css";

type RoleCheckboxesProps = {
  id: string;
  value: readonly RoleCode[];
  onChange: (roles: RoleCode[]) => void;
  errors?: string[];
};

/** Every role as a checkbox; the value always follows ROLE_CODES order. Presentational. */
export default function RoleCheckboxes({ id, value, onChange, errors = [] }: RoleCheckboxesProps) {
  const errorId = `${id}-errors`;

  function toggle(role: RoleCode) {
    const selected = value.includes(role);
    onChange(ROLE_CODES.filter((code) => (code === role ? !selected : value.includes(code))));
  }

  return (
    <fieldset
      id={id}
      className={styles.roles}
      aria-invalid={errors.length > 0}
      aria-describedby={errors.length > 0 ? errorId : undefined}
    >
      <legend className={styles.legend}>Roles</legend>
      <div className={styles.options}>
        {ROLE_CODES.map((role) => (
          <label key={role} className={styles.option}>
            <input
              type="checkbox"
              name="roles"
              value={role}
              checked={value.includes(role)}
              onChange={() => toggle(role)}
              className={styles.checkbox}
            />
            {ROLE_LABELS[role]}
          </label>
        ))}
      </div>
      {errors.length > 0 && (
        <ul id={errorId} className={styles.errors}>
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
