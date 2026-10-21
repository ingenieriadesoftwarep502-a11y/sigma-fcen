import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import SearchField from "@/components/ui/search-field";
import SelectField from "@/components/ui/select-field";
import styles from "@/components/ui/toolbar.module.css";
import { ROLE_CODES, ROLE_LABELS, type RoleCode } from "@/lib/auth";

import { isActiveOf, statusValueOf } from "../filters";

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
  return (
    <div className={styles.toolbar} role="search" aria-label="Filtrar usuarios">
      <div className={styles.filters}>
        <SearchField
          id="users-search"
          label="Buscar usuarios"
          placeholder="Buscar por nombre o correo"
          value={search}
          onChange={onSearchChange}
          onClear={onSearchClear}
          className={styles.search}
        />
        <SelectField
          id="users-role"
          label="Rol"
          className={styles.select}
          value={role ?? ""}
          onChange={(value) => onRoleChange((value || null) as RoleCode | null)}
        >
          <option value="">Todos los roles</option>
          {ROLE_CODES.map((code) => (
            <option key={code} value={code}>
              {ROLE_LABELS[code]}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="users-status"
          label="Estado"
          className={styles.select}
          value={statusValueOf(isActive)}
          onChange={(value) => onStatusChange(isActiveOf(value))}
        >
          <option value="">Todos los estados</option>
          <option value="activas">Activas</option>
          <option value="inactivas">Inactivas</option>
        </SelectField>
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
