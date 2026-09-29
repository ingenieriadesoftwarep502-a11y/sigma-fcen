import { useRef } from "react";

import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { ROLE_CODES, ROLE_LABELS, type RoleCode } from "@/lib/auth";

import { isActiveOf, statusValueOf } from "../filters";
import styles from "./users-toolbar.module.css";

type UsersToolbarProps = {
  /** What is typed in the search box; the list follows it after a short pause. */
  search: string;
  role: RoleCode | null;
  isActive: boolean | null;
  /** Accounts matching the filters, or null before the first answer. */
  count: number | null;
  exporting: boolean;
  onSearchChange: (search: string) => void;
  onSearchClear: () => void;
  onRoleChange: (role: RoleCode | null) => void;
  onStatusChange: (isActive: boolean | null) => void;
  onExport: () => void;
};

const countFormat = new Intl.NumberFormat("es-CO");

function countLabel(count: number): string {
  return `${countFormat.format(count)} ${count === 1 ? "usuario" : "usuarios"}`;
}

/** Search, role and status filters, the result count and the export. Presentational. */
export default function UsersToolbar({
  search,
  role,
  isActive,
  count,
  exporting,
  onSearchChange,
  onSearchClear,
  onRoleChange,
  onStatusChange,
  onExport,
}: UsersToolbarProps) {
  const searchInput = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.toolbar} role="search" aria-label="Filtrar usuarios">
      <div className={styles.filters}>
        <div className={styles.search}>
          <label htmlFor="users-search" className="sr-only">
            Buscar usuarios
          </label>
          <Icon name="search" className={styles.searchIcon} />
          <input
            ref={searchInput}
            id="users-search"
            type="search"
            className={styles.searchInput}
            placeholder="Buscar por nombre o correo"
            autoComplete="off"
            spellCheck={false}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {search && (
            <button
              type="button"
              className={styles.clear}
              aria-label="Limpiar búsqueda"
              onClick={() => {
                onSearchClear();
                searchInput.current?.focus();
              }}
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        <label htmlFor="users-role" className="sr-only">
          Rol
        </label>
        <select
          id="users-role"
          className={styles.select}
          value={role ?? ""}
          onChange={(event) => onRoleChange((event.target.value || null) as RoleCode | null)}
        >
          <option value="">Todos los roles</option>
          {ROLE_CODES.map((code) => (
            <option key={code} value={code}>
              {ROLE_LABELS[code]}
            </option>
          ))}
        </select>

        <label htmlFor="users-status" className="sr-only">
          Estado
        </label>
        <select
          id="users-status"
          className={styles.select}
          value={statusValueOf(isActive)}
          onChange={(event) => onStatusChange(isActiveOf(event.target.value))}
        >
          <option value="">Todos los estados</option>
          <option value="activas">Activas</option>
          <option value="inactivas">Inactivas</option>
        </select>
      </div>

      <div className={styles.summary}>
        <p className={styles.count} aria-live="polite">
          {count === null ? "" : countLabel(count)}
        </p>
        <Button variant="ghost" size="sm" onClick={onExport} softDisabled={exporting}>
          <Icon name="download" />
          {exporting ? "Descargando…" : "Descargar Excel"}
        </Button>
      </div>
    </div>
  );
}
