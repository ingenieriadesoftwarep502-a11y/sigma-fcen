import type { MouseEvent } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/auth";
import { type AdminUser, USERS_PAGE_SIZE, type UserPage } from "@/lib/users";

import styles from "./users-table.module.css";

type UsersTableProps = {
  page: number;
  data: UserPage | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  /** A change is being stored: selecting and paging wait until it settles. */
  locked: boolean;
  onSelect: (user: AdminUser, event: MouseEvent<HTMLButtonElement>) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
};

/** One page of accounts with its pagination. Presentational. */
export default function UsersTable({
  page,
  data,
  loading,
  error,
  selectedId,
  locked,
  onSelect,
  onPageChange,
  onRetry,
}: UsersTableProps) {
  const failure = error && (
    <div className={styles.failure}>
      <Alert tone="error">{error}</Alert>
      <Button variant="ghost" onClick={onRetry}>
        Intentar de nuevo
      </Button>
    </div>
  );

  if (!data) {
    return (
      failure || (
        <p role="status" className={styles.placeholder}>
          Cargando usuarios…
        </p>
      )
    );
  }

  const pages = Math.max(1, Math.ceil(data.count / USERS_PAGE_SIZE));

  return (
    <div className={styles.list}>
      {failure}
      <div className={styles.scroller}>
        <table className={styles.table} aria-busy={loading}>
          <caption className={styles.caption}>
            Usuarios ordenados por correo. Selecciona un correo para editar la cuenta.
          </caption>
          <thead>
            <tr>
              <th scope="col">Correo</th>
              <th scope="col">Nombre</th>
              <th scope="col">Roles</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.results.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Aún no hay usuarios registrados.
                </td>
              </tr>
            ) : (
              data.results.map((user) => (
                <tr key={user.id} data-selected={user.id === selectedId || undefined}>
                  <th scope="row">
                    <button
                      type="button"
                      className={styles.select}
                      aria-pressed={user.id === selectedId}
                      disabled={locked}
                      onClick={(event) => onSelect(user, event)}
                    >
                      {user.email}
                    </button>
                  </th>
                  <td>{`${user.first_name} ${user.last_name}`.trim() || "—"}</td>
                  <td>
                    <ul className={styles.roles}>
                      {user.roles.map((role) => (
                        <li key={role} className={styles.role}>
                          {ROLE_LABELS[role]}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <span className={styles.state} data-active={user.is_active}>
                      {user.is_active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <nav className={styles.pager} aria-label="Paginación de usuarios">
        <Button
          variant="ghost"
          disabled={!data.previous || loading || locked}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </Button>
        <span className={styles.pageInfo}>{`Página ${page} de ${pages}`}</span>
        <Button
          variant="ghost"
          disabled={!data.next || loading || locked}
          onClick={() => onPageChange(page + 1)}
        >
          Siguiente
        </Button>
      </nav>
    </div>
  );
}
