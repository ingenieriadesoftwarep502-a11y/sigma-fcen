"use client";

import { type KeyboardEvent, useRef } from "react";

import styles from "./tabs.module.css";

export type TabItem<K extends string> = { key: K; label: string };

type TabListProps<K extends string> = {
  /** Names the tab list, e.g. "Secciones del catálogo". */
  label: string;
  /** Prefix for the ids that tie each tab to its panel. */
  idPrefix: string;
  tabs: readonly TabItem<K>[];
  selected: K;
  onSelect: (key: K) => void;
};

export function tabId(idPrefix: string, key: string): string {
  return `${idPrefix}-tab-${key}`;
}

export function panelId(idPrefix: string, key: string): string {
  return `${idPrefix}-panel-${key}`;
}

/**
 * WAI-ARIA tabs with manual activation: arrow keys, Home and End move focus between tabs,
 * Enter, Space or a click selects one. Only the selected tab is in the Tab sequence. The
 * caller renders the selected panel with `role="tabpanel"` and the ids above.
 */
export default function TabList<K extends string>({
  label,
  idPrefix,
  tabs,
  selected,
  onSelect,
}: TabListProps<K>) {
  const list = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const target = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
  }

  return (
    <div ref={list} role="tablist" aria-label={label} className={styles.list}>
      {tabs.map((tab, index) => {
        const isSelected = tab.key === selected;
        return (
          <button
            key={tab.key}
            id={tabId(idPrefix, tab.key)}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={panelId(idPrefix, tab.key)}
            tabIndex={isSelected ? 0 : -1}
            className={styles.tab}
            onClick={() => onSelect(tab.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
