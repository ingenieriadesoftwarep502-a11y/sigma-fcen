"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Avatar from "@/components/ui/avatar";
import Button from "@/components/ui/button";
import DataTable from "@/components/ui/data-table";
import Drawer from "@/components/ui/drawer";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import SearchField from "@/components/ui/search-field";
import toolbar from "@/components/ui/toolbar.module.css";
import { requestErrorMessage } from "@/lib/api-client";
import {
  type Assignment,
  type AssignmentFilters,
  CATALOG_PAGE_SIZE,
  deleteAssignment,
  listAssignments,
  type Term,
} from "@/lib/catalog";
import { initialsOfFullName } from "@/lib/people";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useDrawerState } from "@/lib/use-drawer-state";
import { usePagedList } from "@/lib/use-paged-list";

import { assignmentFiltersFromParams, paramsFromAssignmentFilters, sameFilters } from "../filters";
import { countLabel, hoursLabel } from "../labels";
import AssignmentForm from "./assignment-form";
import styles from "./catalog-admin.module.css";
import TermSelect from "./term-select";

type AssignmentsPanelProps = {
  initial: URLSearchParams;
  terms: Term[] | null;
  current: Term | null;
  onUrlChange: (params: URLSearchParams) => void;
  onCatalogChange: () => void;
};

const COLUMNS = [
  { label: "Monitor", className: styles.wideColumn },
  { label: "Asignatura" },
  { label: "Horas", className: styles.numberColumn },
  { label: "Acciones", className: styles.actionsColumn },
];

function withdrawButtonId(assignment: Assignment): string {
  return `withdraw-assignment-${assignment.id}`;
}

/**
 * Which monitors are authorized for which subject in a term, and how many hours they
 * commit (T-02.10, RF-023). Withdrawing an authorization asks for confirmation in the row.
 */
export default function AssignmentsPanel({
  initial,
  terms,
  current,
  onUrlChange,
  onCatalogChange,
}: AssignmentsPanelProps) {
  const [initialFilters] = useState(() => assignmentFiltersFromParams(initial));
  const list = usePagedList(listAssignments, initialFilters, sameFilters);
  const [searchInput, setSearchInput] = useState(initialFilters.search);
  const search = useDebouncedValue(searchInput);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Assignment | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const drawer = useDrawerState<"create">(newButton);
  const filters = list.filters;

  function apply(next: AssignmentFilters) {
    if (list.setFilters(next)) onUrlChange(paramsFromAssignmentFilters(next));
  }

  const applySearch = useEffectEvent((value: string) => apply({ ...filters, search: value }));
  useEffect(() => applySearch(search), [search]);

  // Where focus returns once a confirmation is dismissed.
  const restoreFocusTo = useRef<string | null>(null);

  // The confirmation takes focus as soon as it appears; cancelling gives it back.
  useEffect(() => {
    if (confirming) {
      confirmButton.current?.focus();
    } else if (restoreFocusTo.current) {
      document.getElementById(restoreFocusTo.current)?.focus();
      restoreFocusTo.current = null;
    }
  }, [confirming]);

  function saved(message: string) {
    setNotice(message);
    drawer.close();
    list.reload();
    onCatalogChange();
  }

  function cancelWithdraw(assignment: Assignment) {
    restoreFocusTo.current = withdrawButtonId(assignment);
    setConfirming(null);
    setFailure(null);
  }

  async function withdraw(assignment: Assignment) {
    setWithdrawing(true);
    setFailure(null);
    try {
      await deleteAssignment(assignment.id);
    } catch (error) {
      setFailure(requestErrorMessage(error));
      setWithdrawing(false);
      return;
    }
    setWithdrawing(false);
    setConfirming(null);
    setNotice(`Se retiró a ${assignment.monitor.full_name} de ${assignment.subject.code}.`);
    // The row is gone: keep keyboard focus on the panel's main action.
    newButton.current?.focus();
    list.reload();
    onCatalogChange();
  }

  const locked = drawer.busy || withdrawing;

  return (
    <div className={styles.panel}>
      <div className={toolbar.toolbar} role="search" aria-label="Filtrar asignaciones">
        <div className={toolbar.filters}>
          <SearchField
            id="admin-assignments-search"
            label="Buscar asignaciones"
            placeholder="Monitor o asignatura"
            value={searchInput}
            onChange={setSearchInput}
            onClear={() => {
              setSearchInput("");
              apply({ ...filters, search: "" });
            }}
            className={toolbar.search}
          />
          <TermSelect
            id="admin-assignments-term"
            value={filters.term}
            terms={terms}
            current={current}
            onChange={(term) => apply({ ...filters, term })}
            className={toolbar.select}
          />
        </div>
        <div className={toolbar.summary}>
          <p className={toolbar.count} aria-live="polite">
            {list.data ? countLabel(list.data.count, "asignación", "asignaciones") : ""}
          </p>
          <Button
            ref={newButton}
            size="sm"
            disabled={drawer.busy}
            onClick={(event) => {
              setNotice(null);
              drawer.open("create", event);
            }}
          >
            <Icon name="plus" />
            Asignar monitor
          </Button>
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {failure && <Alert tone="error">{failure}</Alert>}

      <DataTable
        label="Lista de asignaciones de monitores"
        caption="Monitores autorizados por asignatura en el período, con sus horas comprometidas."
        loadingLabel="Cargando asignaciones…"
        paginationLabel="Paginación de asignaciones"
        columns={COLUMNS}
        tableClassName={styles.assignmentsTable}
        page={list.page}
        pageSize={CATALOG_PAGE_SIZE}
        data={list.data}
        loading={list.loading}
        error={list.error}
        locked={locked}
        onPageChange={list.goTo}
        onRetry={list.reload}
        empty={
          filters.search.trim() ? (
            <EmptyState title="Ninguna asignación coincide con la búsqueda.">
              <p>Prueba con el nombre o el correo del monitor, o con el código de la asignatura.</p>
            </EmptyState>
          ) : (
            <EmptyState title="Aún no hay monitores asignados en este período.">
              <p>Autoriza al primero con «Asignar monitor».</p>
            </EmptyState>
          )
        }
        renderRow={(assignment) => {
          const isConfirming = confirming?.id === assignment.id;
          const who = assignment.monitor.full_name || assignment.monitor.email;
          return (
            <tr key={assignment.id} data-selected={isConfirming || undefined}>
              <th scope="row">
                <span className={styles.personRow}>
                  <Avatar
                    initials={initialsOfFullName(assignment.monitor.full_name, assignment.monitor.email)}
                    size="sm"
                  />
                  <span className={styles.person}>
                    <span className={styles.personName}>{who}</span>
                    <span className={styles.personEmail}>{assignment.monitor.email}</span>
                  </span>
                </span>
              </th>
              <td>
                <span className={styles.person}>
                  <span className={styles.personName}>{assignment.subject.name}</span>
                  <span className={styles.personEmail}>{assignment.subject.code}</span>
                </span>
              </td>
              <td className={styles.number}>{hoursLabel(assignment.committed_hours)}</td>
              <td>
                <div className={styles.rowActions}>
                  {/* Hidden rather than removed, so focus can come back to it. */}
                  <Button
                    id={withdrawButtonId(assignment)}
                    variant="ghost"
                    size="sm"
                    hidden={isConfirming}
                    softDisabled={locked}
                    aria-label={`Retirar a ${who} de ${assignment.subject.name}`}
                    onClick={() => {
                      setNotice(null);
                      setConfirming(assignment);
                    }}
                  >
                    Retirar
                  </Button>
                  {isConfirming && (
                    <div className={styles.confirm} role="group" aria-label="Confirmar retiro">
                      <span className={styles.confirmText}>¿Retirar esta autorización?</span>
                      <Button
                        ref={confirmButton}
                        variant="danger"
                        size="sm"
                        softDisabled={withdrawing}
                        onClick={() => withdraw(assignment)}
                      >
                        {withdrawing ? "Retirando…" : "Confirmar retiro"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        softDisabled={withdrawing}
                        onClick={() => cancelWithdraw(assignment)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          );
        }}
      />

      {drawer.panel === "create" && (
        <Drawer title="Asignar monitor" locked={drawer.busy} onClose={drawer.close}>
          <AssignmentForm
            term={filters.term}
            terms={terms}
            current={current}
            onSaved={saved}
            onBusyChange={drawer.setBusy}
          />
        </Drawer>
      )}
    </div>
  );
}
