import type { MouseEvent } from "react";

import Alert from "@/components/ui/alert";
import Avatar from "@/components/ui/avatar";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import RoleTags from "@/components/ui/role-tag";
import { formatDate } from "@/lib/format";
import { displayName, initialsOf } from "@/lib/people";
import { type AdminUser, USERS_PAGE_SIZE, type UserPage } from "@/lib/users";

import styles from "./users-table.module.css";

type UsersTableProps = {
  page: number;
  data: UserPage | null;
  loading: boolean;
  error: string | null;
  /** Filters are in use: an empty page means "no matches", not "no users". */
  filtered: boolean;
  selectedId: string | null;
  /** A change is being stored: selecting and paging wait until it settles. */
  locked: boolean;
  onSelect: (user: AdminUser, event: MouseEvent<HTMLButtonElement>) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onClearFilters: () => void;
};

const COLUMNS = ["Usuario", "Roles", "Estado", "Registro"] as const;
const SKELETON_ROWS = 6;

function SkeletonTable() {
  return (
    <div className={styles.scroller}>
      <p role="status" className="sr-only">
        Cargando usuarios…
      </p>
      <div className={styles.skeleton} aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <div key={index} className={styles.skeletonRow}>
            <span className={styles.skeletonAvatar} />
            <span className={styles.skeletonLine} />
            <span className={styles.skeletonLine} data-short />
          </div>
        ))}
      </div>
    </div>
  );
}

/** One page of accounts with its pagination, plus its loading, empty and error states. */
export default function UsersTable({
  page,
  data,
  loading,
  error,
  filtered,
  selectedId,
  locked,
  onSelect,
  onPageChange,
  onRetry,
  onClearFilters,
}: UsersTableProps) {
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
    return failure || <SkeletonTable />;
  }

  const pages = Math.max(1, Math.ceil(data.count / USERS_PAGE_SIZE));

  return (
    <div className={styles.list}>
      {failure}
      {/* Focusable so keyboard users can scroll the table sideways on narrow screens. */}
      <div className={styles.scroller} role="region" aria-label="Lista de usuarios" tabIndex={0}>
        <table className={styles.table} aria-busy={loading}>
          <caption className="sr-only">
            Usuarios ordenados por correo. Selecciona una persona para editar su cuenta.
          </caption>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.results.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className={styles.empty}>
                  {filtered ? (
                    <div className={styles.emptyBody}>
                      <p className={styles.emptyTitle}>Ningún usuario coincide con los filtros.</p>
                      <p>Prueba con otro nombre o correo, o quita los filtros de rol y estado.</p>
                      <Button variant="ghost" size="sm" onClick={onClearFilters}>
                        Limpiar filtros
                      </Button>
                    </div>
                  ) : (
                    <div className={styles.emptyBody}>
                      <p className={styles.emptyTitle}>Aún no hay usuarios registrados.</p>
                      <p>Las cuentas que crees o que se registren aparecerán aquí.</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              data.results.map((user) => {
                const name = displayName(user);
                const hasName = name !== user.email;
                return (
                  <tr key={user.id} data-selected={user.id === selectedId || undefined}>
                    <th scope="row">
                      <button
                        type="button"
                        className={styles.person}
                        aria-haspopup="dialog"
                        disabled={locked}
                        onClick={(event) => onSelect(user, event)}
                      >
                        <Avatar initials={initialsOf(user)} size="sm" />
                        <span className={styles.identity}>
                          <span className={styles.name} title={name}>
                            {name}
                          </span>
                          {hasName && (
                            <>
                              {" "}
                              <span className={styles.email} title={user.email}>
                                {user.email}
                              </span>
                            </>
                          )}
                        </span>
                      </button>
                    </th>
                    <td>
                      <RoleTags roles={user.roles} />
                    </td>
                    <td>
                      <span className={styles.state} data-active={user.is_active}>
                        {user.is_active ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className={styles.date}>
                      <time dateTime={user.date_joined}>{formatDate(user.date_joined)}</time>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <nav className={styles.pager} aria-label="Paginación de usuarios">
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
    </div>
  );
}
