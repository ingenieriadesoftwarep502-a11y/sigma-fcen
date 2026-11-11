import type { ReactNode, SelectHTMLAttributes } from "react";

import styles from "./controls.module.css";

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
  id: string;
  label: string;
  onChange: (value: string) => void;
  /**
   * `toolbar`: a compact filter whose label is read by assistive technology only.
   * `form`: label above, validation messages below, for drawer forms.
   */
  variant?: "toolbar" | "form";
  errors?: string[];
  children: ReactNode;
};

/** A native select in the app's control style. Presentational. */
export default function SelectField({
  id,
  label,
  onChange,
  variant = "toolbar",
  errors = [],
  className,
  children,
  ...select
}: SelectFieldProps) {
  const errorId = `${id}-errors`;
  const control = (
    <select
      id={id}
      name={id}
      className={className ? `${styles.select} ${className}` : styles.select}
      aria-invalid={errors.length > 0 || undefined}
      aria-describedby={errors.length > 0 ? errorId : undefined}
      onChange={(event) => onChange(event.target.value)}
      {...select}
    >
      {children}
    </select>
  );

  if (variant === "toolbar") {
    return (
      <>
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        {control}
      </>
    );
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      {control}
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
