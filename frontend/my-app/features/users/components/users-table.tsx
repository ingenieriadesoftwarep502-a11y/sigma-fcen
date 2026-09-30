import type { MouseEvent } from "react";

import Avatar from "@/components/ui/avatar";
import Button from "@/components/ui/button";
import DataTable, { ActiveState, RowTrigger } from "@/components/ui/data-table";
import EmptyState from "@/components/ui/empty-state";
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

const COLUMNS = [
  { label: "Usuario", className: styles.userColumn },
  { label: "Roles" },
  { label: "Estado", className: styles.stateColumn },
  { label: "Registro", className: styles.dateColumn },
] as const;

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
  const empty = filtered ? (
    <EmptyState
      title="Ningún usuario coincide con los filtros."
      action={
        <Button variant="ghost" size="sm" onClick={onClearFilters}>
          Limpiar filtros
        </Button>
      }
    >
      <p>Prueba con otro nombre o correo, o quita los filtros de rol y estado.</p>
    </EmptyState>
  ) : (
    <EmptyState title="Aún no hay usuarios registrados.">
      <p>Las cuentas que crees o que se registren aparecerán aquí.</p>
    </EmptyState>
  );

  return (
    <DataTable
      label="Lista de usuarios"
      caption="Usuarios ordenados por correo. Selecciona una persona para editar su cuenta."
      loadingLabel="Cargando usuarios…"
      paginationLabel="Paginación de usuarios"
      columns={COLUMNS}
      page={page}
      pageSize={USERS_PAGE_SIZE}
      data={data}
      loading={loading}
      error={error}
      locked={locked}
      empty={empty}
      onPageChange={onPageChange}
      onRetry={onRetry}
      renderRow={(user) => {
        const name = displayName(user);
        return (
          <tr key={user.id} data-selected={user.id === selectedId || undefined}>
            <th scope="row">
              <RowTrigger
                primary={name}
                secondary={name !== user.email ? user.email : undefined}
                leading={<Avatar initials={initialsOf(user)} size="sm" />}
                disabled={locked}
                onClick={(event) => onSelect(user, event)}
              />
            </th>
            <td>
              <RoleTags roles={user.roles} />
            </td>
            <td>
              <ActiveState active={user.is_active} labels={["Activa", "Inactiva"]} />
            </td>
            <td className={styles.date}>
              <time dateTime={user.date_joined}>{formatDate(user.date_joined)}</time>
            </td>
          </tr>
        );
      }}
    />
  );
}
