import type { MouseEvent, ReactNode } from "react";

import Alert from "./alert";
import Button from "./button";
import Icon from "./icon";
import styles from "./data-table.module.css";

/** One page of a DRF list (`{count, next, previous, results}`). */
export type Page<T> = {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
};

export type Column = {
  label: string;
  /** Sizes the column (the table uses a fixed layout, so long text ellipsizes). */
  className?: string;
};

type DataTableProps<T> = {
  /** Names the scrollable region, e.g. "Lista de usuarios". */
  label: string;
  caption: string;
  /** Announced while the first page loads, e.g. "Cargando usuarios…". */
  loadingLabel: string;
  /** Names the pagination landmark. */
  paginationLabel: string;
  columns: readonly Column[];
  page: number;
  pageSize: number;
  /** The last page received; kept while the next one loads so the table does not flash. */
  data: Page<T> | null;
  loading: boolean;
  error: string | null;
  /** A change is being stored: paging waits until it settles. */
  locked?: boolean;
  /** Shown in place of the rows when the page is empty. */
  empty: ReactNode;
  /** Sizes the table, e.g. its minimum width before it scrolls sideways. */
  tableClassName?: string;
  /** One `<tr>` per item; its first cell is usually a `<th scope="row">`. */
  renderRow: (item: T) => ReactNode;
  onPageChange: (page: number) => void;
  onRetry: () => void;
};

const SKELETON_ROWS = 6;

function SkeletonTable({ label }: { label: string }) {
  return (
    <div className={styles.scroller}>
      <p role="status" className="sr-only">
        {label}
      </p>
      <div className={styles.skeleton} aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <div key={index} className={styles.skeletonRow}>
            <span className={styles.skeletonLine} />
            <span className={styles.skeletonLine} data-short />
            <span className={styles.skeletonLine} data-short />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The shell every admin list shares: a horizontally scrollable table with a loading bar,
 * skeleton, empty and error states, and previous/next pagination. Rows are the caller's.
 */
export default function DataTable<T>({
  label,
  caption,
  loadingLabel,
  paginationLabel,
  columns,
  page,
  pageSize,
  data,
  loading,
  error,
  locked = false,
  empty,
  tableClassName,
  renderRow,
  onPageChange,
  onRetry,
}: DataTableProps<T>) {
  const failure = error && (
    <div className={styles.failure}>
      <Alert tone="error">{error}</Alert>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        <Icon name="refresh" />
        Intentar de nuevo
      </Button>
    </div>
  );

  if (!data) {
    return failure || <SkeletonTable label={loadingLabel} />;
  }

  const pages = Math.max(1, Math.ceil(data.count / pageSize));

  return (
    <div className={styles.list}>
      {failure}
      {/* Focusable so keyboard users can scroll the table sideways on narrow screens. */}
      <div className={styles.scroller} role="region" aria-label={label} tabIndex={0}>
        <table
          className={tableClassName ? `${styles.table} ${tableClassName}` : styles.table}
          aria-busy={loading}
        >
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.label} scope="col" className={column.className}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.results.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.empty}>
                  {empty}
                </td>
              </tr>
            ) : (
              data.results.map(renderRow)
            )}
          </tbody>
        </table>
      </div>
      {(pages > 1 || page > 1) && (
        <nav className={styles.pager} aria-label={paginationLabel}>
          <Button
            variant="ghost"
            size="sm"
            softDisabled={!data.previous || loading || locked}
            onClick={() => onPageChange(page - 1)}
          >
            Anterior
          </Button>
          <span className={styles.pageInfo}>{`Página ${page} de ${pages}`}</span>
          <Button
            variant="ghost"
            size="sm"
            softDisabled={!data.next || loading || locked}
            onClick={() => onPageChange(page + 1)}
          >
            Siguiente
          </Button>
        </nav>
      )}
    </div>
  );
}

type RowTriggerProps = {
  primary: string;
  /** A second, quieter line: an email, a code. */
  secondary?: string;
  /** Before the text, e.g. an avatar. */
  leading?: ReactNode;
  disabled?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
};

/**
 * The first cell of a row as the button that opens it for editing: a large target that
 * still reads as text, underlined on hover.
 */
export function RowTrigger({ primary, secondary, leading, disabled, onClick }: RowTriggerProps) {
  return (
    <button
      type="button"
      className={styles.trigger}
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={onClick}
    >
      {leading}
      <span className={styles.identity}>
        <span className={styles.primary} title={primary}>
          {primary}
        </span>
        {secondary && (
          <>
            {" "}
            <span className={styles.secondary} title={secondary}>
              {secondary}
            </span>
          </>
        )}
      </span>
    </button>
  );
}

/** Active or inactive, as a dot and a word (the dot alone would rely on color). */
export function ActiveState({ active, labels }: { active: boolean; labels: [string, string] }) {
  return (
    <span className={styles.state} data-active={active}>
      {active ? labels[0] : labels[1]}
    </span>
  );
}
