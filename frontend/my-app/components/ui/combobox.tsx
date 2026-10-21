"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { requestErrorMessage } from "@/lib/api-client";

import styles from "./combobox.module.css";
import Icon from "./icon";

type AsyncComboboxProps<T> = {
  id: string;
  label: string;
  placeholder?: string;
  value: T | null;
  onChange: (value: T | null) => void;
  /** Asks the API for the matches of what is typed ("" for a first page). */
  search: (query: string, signal: AbortSignal) => Promise<T[]>;
  optionKey: (item: T) => string;
  /** The text the box shows once the item is chosen. */
  optionLabel: (item: T) => string;
  /** How an option reads in the list; defaults to its label. */
  renderOption?: (item: T) => ReactNode;
  emptyMessage: string;
  errors?: string[];
  disabled?: boolean;
  /** Pause after the last keystroke before searching, in milliseconds. */
  delay?: number;
};

type Query = { text: string; n: number };
type Answer<T> = { query: Query; items: T[]; error: string | null };

function countLabel(count: number): string {
  return count === 1 ? "1 resultado" : `${count} resultados`;
}

/**
 * A text box that searches the API as the person types and offers the matches as a list
 * (WAI-ARIA combobox with a listbox popup). Arrow keys move through the options, Enter
 * chooses, Escape closes the list without closing the drawer around it. Editing the text
 * drops the current choice; the clear button removes it.
 */
export default function AsyncCombobox<T>({
  id,
  label,
  placeholder,
  value,
  onChange,
  search,
  optionKey,
  optionLabel,
  renderOption,
  emptyMessage,
  errors = [],
  disabled = false,
  delay = 250,
}: AsyncComboboxProps<T>) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => (value === null ? "" : optionLabel(value)));
  // The search in view; null while the list is closed.
  const [query, setQuery] = useState<Query | null>(null);
  const [answer, setAnswer] = useState<Answer<T> | null>(null);
  const [active, setActive] = useState(-1);

  const runSearch = useEffectEvent((typed: string, signal: AbortSignal) => search(typed, signal));

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      runSearch(query.text, controller.signal).then(
        (items) => {
          if (controller.signal.aborted) return;
          setAnswer({ query, items, error: null });
          setActive(-1);
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setAnswer({ query, items: [], error: requestErrorMessage(error) });
        },
      );
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, delay]);

  const open = query !== null;
  const loading = open && answer?.query !== query;
  const items = open && answer ? answer.items : [];
  const listboxId = `${id}-listbox`;
  const errorId = `${id}-errors`;
  const optionId = (index: number) => `${id}-option-${index}`;

  function lookUp(typed: string) {
    setQuery((current) => ({ text: typed, n: (current?.n ?? 0) + 1 }));
  }

  function close() {
    setQuery(null);
    setActive(-1);
  }

  function choose(item: T) {
    onChange(item);
    setText(optionLabel(item));
    close();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) lookUp(text);
        else setActive((index) => Math.min(index + 1, items.length - 1));
        return;
      case "ArrowUp":
        if (!open) return;
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
        return;
      case "Enter": {
        if (!open) return;
        // Choosing from the list must not submit the form around it.
        event.preventDefault();
        const item = items[active];
        if (item !== undefined) choose(item);
        return;
      }
      case "Escape":
        if (!open) return;
        event.preventDefault();
        // The list closes; the drawer that holds the box stays open.
        event.stopPropagation();
        close();
        return;
    }
  }

  let status = "";
  if (open) {
    if (loading) status = "Buscando…";
    else if (answer?.error) status = answer.error;
    else if (items.length === 0) status = emptyMessage;
    else status = countLabel(items.length);
  }
  const statusVisible = open && (loading || items.length === 0);

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <input
          ref={input}
          id={id}
          name={id}
          type="text"
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-invalid={errors.length > 0 || undefined}
          aria-describedby={errors.length > 0 ? errorId : undefined}
          className={styles.input}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (value !== null) onChange(null);
            lookUp(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={close}
        />
        {value !== null && !disabled && (
          <button
            type="button"
            className={styles.clear}
            aria-label={`Quitar ${label}`}
            onClick={() => {
              onChange(null);
              setText("");
              input.current?.focus();
            }}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
      <ul
        id={listboxId}
        role="listbox"
        aria-label={label}
        className={styles.listbox}
        hidden={!open || items.length === 0}
      >
        {items.map((item, index) => (
          <li
            key={optionKey(item)}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            className={styles.option}
            // Keeps focus in the box, so choosing does not blur and close the list first.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(index)}
            onClick={() => choose(item)}
          >
            {renderOption ? renderOption(item) : optionLabel(item)}
          </li>
        ))}
      </ul>
      <p
        role="status"
        className={statusVisible ? styles.status : "sr-only"}
        data-error={(open && !loading && answer?.error) || undefined}
      >
        {status}
      </p>
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
