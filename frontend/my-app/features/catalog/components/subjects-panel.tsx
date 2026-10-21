"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import DataTable, { ActiveState, RowTrigger } from "@/components/ui/data-table";
import Drawer from "@/components/ui/drawer";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import SearchField from "@/components/ui/search-field";
import SelectField from "@/components/ui/select-field";
import toolbar from "@/components/ui/toolbar.module.css";
import {
  CATALOG_PAGE_SIZE,
  type Department,
  listSubjects,
  type Subject,
  type SubjectFilters,
  type Term,
} from "@/lib/catalog";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useDrawerState } from "@/lib/use-drawer-state";
import { usePagedList } from "@/lib/use-paged-list";

import {
  paramsFromSubjectAdminFilters,
  sameFilters,
  subjectAdminFiltersFromParams,
} from "../filters";
import { countLabel } from "../labels";
import styles from "./catalog-admin.module.css";
import SubjectForm from "./subject-form";
import TermSelect from "./term-select";

type Panel = { mode: "create" } | { mode: "edit"; subject: Subject };

type SubjectsPanelProps = {
  initial: URLSearchParams;
  departments: Department[] | null;
  terms: Term[] | null;
  current: Term | null;
  onUrlChange: (params: URLSearchParams) => void;
  onCatalogChange: () => void;
};

const COLUMNS = [
  { label: "Código", className: styles.codeColumn },
  { label: "Asignatura", className: styles.wideColumn },
  { label: "Departamento" },
  { label: "Créditos", className: styles.numberColumn },
  { label: "Monitores", className: styles.numberColumn },
  { label: "Estado", className: styles.stateColumn },
];

/** Every subject, active or not, with its monitors in a term; create and edit (RF-022). */
export default function SubjectsPanel({
  initial,
  departments,
  terms,
  current,
  onUrlChange,
  onCatalogChange,
}: SubjectsPanelProps) {
  const [initialFilters] = useState(() => subjectAdminFiltersFromParams(initial));
  const list = usePagedList(listSubjects, initialFilters, sameFilters);
  const [searchInput, setSearchInput] = useState(initialFilters.search);
  const search = useDebouncedValue(searchInput);
  const [notice, setNotice] = useState<string | null>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const drawer = useDrawerState<Panel>(newButton);
  const filters = list.filters;

  function apply(next: SubjectFilters) {
    if (list.setFilters(next)) onUrlChange(paramsFromSubjectAdminFilters(next));
  }

  const applySearch = useEffectEvent((value: string) => apply({ ...filters, search: value }));
  useEffect(() => applySearch(search), [search]);

  function saved(message: string) {
    setNotice(message);
    drawer.close();
    list.reload();
    onCatalogChange();
  }

  const filtered =
    filters.search.trim() !== "" || filters.department !== null || filters.active !== null;
  const panel = drawer.panel;

  return (
    <div className={styles.panel}>
      <div className={toolbar.toolbar} role="search" aria-label="Filtrar asignaturas">
        <div className={toolbar.filters}>
          <SearchField
            id="admin-subjects-search"
            label="Buscar asignaturas"
            placeholder="Buscar por código o nombre"
            value={searchInput}
            onChange={setSearchInput}
            onClear={() => {
              setSearchInput("");
              apply({ ...filters, search: "" });
            }}
            className={toolbar.search}
          />
          <SelectField
            id="admin-subjects-department"
            label="Departamento"
            className={toolbar.select}
            value={filters.department ?? ""}
            onChange={(value) => apply({ ...filters, department: value || null })}
          >
            <option value="">Todos los departamentos</option>
            {departments?.map((department) => (
              <option key={department.id} value={department.code}>
                {department.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="admin-subjects-status"
            label="Estado"
            className={toolbar.select}
            value={filters.active === null ? "" : filters.active ? "activas" : "inactivas"}
            onChange={(value) =>
              apply({ ...filters, active: value === "" ? null : value === "activas" })
            }
          >
            <option value="">Todos los estados</option>
            <option value="activas">Activas</option>
            <option value="inactivas">Inactivas</option>
          </SelectField>
          <TermSelect
            id="admin-subjects-term"
            value={filters.term}
            terms={terms}
            current={current}
            onChange={(term) => apply({ ...filters, term })}
            className={toolbar.select}
          />
        </div>
        <div className={toolbar.summary}>
          <p className={toolbar.count} aria-live="polite">
            {list.data ? countLabel(list.data.count, "asignatura", "asignaturas") : ""}
          </p>
          <Button
            ref={newButton}
            size="sm"
            disabled={drawer.busy}
            onClick={(event) => {
              setNotice(null);
              drawer.open({ mode: "create" }, event);
            }}
          >
            <Icon name="plus" />
            Nueva asignatura
          </Button>
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}

      <DataTable
        label="Lista de asignaturas"
        caption="Asignaturas ordenadas por nombre, con sus monitores en el período elegido. Selecciona una para editarla."
        loadingLabel="Cargando asignaturas…"
        paginationLabel="Paginación de asignaturas"
        columns={COLUMNS}
        tableClassName={styles.subjectsTable}
        page={list.page}
        pageSize={CATALOG_PAGE_SIZE}
        data={list.data}
        loading={list.loading}
        error={list.error}
        locked={drawer.busy}
        onPageChange={list.goTo}
        onRetry={list.reload}
        empty={
          filtered ? (
            <EmptyState
              title="Ninguna asignatura coincide con los filtros."
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchInput("");
                    apply({ ...filters, search: "", department: null, active: null });
                  }}
                >
                  Limpiar filtros
                </Button>
              }
            >
              <p>Prueba con otro código o nombre, o quita el filtro de departamento o estado.</p>
            </EmptyState>
          ) : (
            <EmptyState title="Aún no hay asignaturas.">
              <p>Crea la primera con «Nueva asignatura».</p>
            </EmptyState>
          )
        }
        renderRow={(subject) => (
          <tr
            key={subject.id}
            data-selected={
              (panel?.mode === "edit" && panel.subject.id === subject.id) || undefined
            }
          >
            <td className={styles.code}>{subject.code}</td>
            <th scope="row">
              <RowTrigger
                primary={subject.name}
                disabled={drawer.busy}
                onClick={(event) => {
                  setNotice(null);
                  drawer.open({ mode: "edit", subject }, event);
                }}
              />
            </th>
            <td className={styles.muted}>{subject.department.name}</td>
            <td className={styles.number}>{subject.credits}</td>
            <td className={styles.number} data-zero={subject.monitor_count === 0 || undefined}>
              {subject.monitor_count}
            </td>
            <td>
              <ActiveState active={subject.is_active} labels={["Activa", "Inactiva"]} />
            </td>
          </tr>
        )}
      />

      {panel?.mode === "create" && (
        <Drawer key="create" title="Nueva asignatura" locked={drawer.busy} onClose={drawer.close}>
          <SubjectForm departments={departments} onSaved={saved} onBusyChange={drawer.setBusy} />
        </Drawer>
      )}
      {panel?.mode === "edit" && (
        <Drawer
          key={panel.subject.id}
          title="Editar asignatura"
          subtitle={panel.subject.code}
          locked={drawer.busy}
          onClose={drawer.close}
        >
          <SubjectForm
            subject={panel.subject}
            departments={departments}
            onSaved={saved}
            onBusyChange={drawer.setBusy}
          />
        </Drawer>
      )}
    </div>
  );
}
