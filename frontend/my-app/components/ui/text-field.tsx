import type { InputHTMLAttributes } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  errors?: string[];
  /** `glass` is for fields laid over photography, such as the login card. */
  variant?: "default" | "glass";
};

const STYLES = {
  default: {
    label: "text-sm font-medium text-zinc-800 dark:text-zinc-200",
    input:
      "rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50",
    errors: "text-sm text-red-700 dark:text-red-400",
  },
  glass: {
    label: "text-[0.8125rem] font-medium tracking-wide text-white/80",
    input: "glass-input",
    errors: "text-sm text-rose-200",
  },
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
  const styles = STYLES[variant];
  return (
    <div className="flex flex-col gap-1.5">
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
