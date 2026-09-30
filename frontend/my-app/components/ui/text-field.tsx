import type { InputHTMLAttributes } from "react";

import styles from "./text-field.module.css";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  errors?: string[];
  /** `glass` is for fields laid over photography, such as the auth card. */
  variant?: "default" | "glass";
};

/** Labelled input that lists its validation messages right below it. */
export default function TextField({
  id,
  label,
  errors = [],
  variant = "default",
  ...input
}: TextFieldProps) {
  const errorId = `${id}-errors`;
  return (
    <div className={styles.field} data-variant={variant}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        aria-invalid={errors.length > 0}
        aria-describedby={errors.length > 0 ? errorId : undefined}
        className={styles.input}
        {...input}
      />
      {errors.length > 0 && (
        <ul id={errorId} className={styles.errors}>
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
