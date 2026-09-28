import type { InputHTMLAttributes } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  errors?: string[];
};

/** Labelled input that lists its validation messages right below it. */
export default function TextField({ id, label, errors = [], ...input }: TextFieldProps) {
  const errorId = `${id}-errors`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {label}
      </label>
      <input
        id={id}
        name={id}
        aria-invalid={errors.length > 0}
        aria-describedby={errors.length > 0 ? errorId : undefined}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        {...input}
      />
      {errors.length > 0 && (
        <ul id={errorId} className="text-sm text-red-700 dark:text-red-400">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
