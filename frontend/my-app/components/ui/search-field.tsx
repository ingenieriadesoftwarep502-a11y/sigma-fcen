"use client";

import { useRef } from "react";

import Icon from "./icon";
import styles from "./controls.module.css";

type SearchFieldProps = {
  id: string;
  /** Read by assistive technology; the placeholder shows the hint visually. */
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** The clear button was pressed; focus returns to the box. */
  onClear: () => void;
  /** `lg` is the hero search of a page whose main task is finding something. */
  size?: "md" | "lg";
  className?: string;
};

/** Search box with a leading icon and a clear button. Presentational. */
export default function SearchField({
  id,
  label,
  placeholder,
  value,
  onChange,
  onClear,
  size = "md",
  className,
}: SearchFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={className ? `${styles.search} ${className}` : styles.search} data-size={size}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Icon name="search" size={size === "lg" ? 20 : 18} className={styles.searchIcon} />
      <input
        ref={input}
        id={id}
        type="search"
        className={styles.searchInput}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button
          type="button"
          className={styles.clear}
          aria-label="Limpiar búsqueda"
          onClick={() => {
            onClear();
            input.current?.focus();
          }}
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
