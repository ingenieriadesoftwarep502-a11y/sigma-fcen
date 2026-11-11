"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import DataTable, { RowTrigger } from "@/components/ui/data-table";
import Drawer from "@/components/ui/drawer";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import SearchField from "@/components/ui/search-field";
import SelectField from "@/components/ui/select-field";
import ToggleChip from "@/components/ui/toggle-chip";
import toolbar from "@/components/ui/toolbar.module.css";
import {
  CATALOG_PAGE_SIZE,
  type Course,
  type CourseFilters,
  type Department,
  listCourses,
  type Term,
} from "@/lib/catalog";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useDrawerState } from "@/lib/use-drawer-state";
import { usePagedList } from "@/lib/use-paged-list";

import { courseFiltersFromParams, paramsFromCourseFilters, sameFilters } from "../filters";
import { countLabel } from "../labels";
import styles from "./catalog-admin.module.css";
import { CourseCreateForm, CourseEditForm } from "./course-form";
import TermSelect from "./term-select";

type Panel = { mode: "create" } | { mode: "edit"; course: Course };

type CoursesPanelProps = {
  initial: URLSearchParams;
  departments: Department[] | null;
  terms: Term[] | null;
  current: Term | null;
  onUrlChange: (params: URLSearchParams) => void;
  onCatalogChange: () => void;
};

const COLUMNS = [
  { label: "Asignatura", className: styles.wideColumn },
  { label: "Grupo", className: styles.groupColumn },
  { label: "Docente" },
  { label: "Monitores", className: styles.numberColumn },
];

/** The courses (groups) of a term, with coverage gaps a toggle away; create and edit (RF-024). */
export default function CoursesPanel({
  initial,
  departments,
  terms,
  current,
  onUrlChange,
  onCatalogChange,
}: CoursesPanelProps) {
  const [initialFilters] = useState(() => courseFiltersFromParams(initial));
  const list = usePagedList(listCourses, initialFilters, sameFilters);
  const [searchInput, setSearchInput] = useState(initialFilters.search);
  const search = useDebouncedValue(searchInput);
  const [notice, setNotice] = useState<string | null>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const drawer = useDrawerState<Panel>(newButton);
  const filters = list.filters;

  function apply(next: CourseFilters) {
    if (list.setFilters(next)) onUrlChange(paramsFromCourseFilters(next));
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
    filters.search.trim() !== "" ||
    filters.department !== null ||
    filters.withoutTeacher ||
    filters.withoutMonitors;
  const panel = drawer.panel;

  return (
    <div className={styles.panel}>
      <div className={toolbar.toolbar} role="search" aria-label="Filtrar cursos">
        <div className={toolbar.filters}>
          <SearchField
            id="admin-courses-search"
            label="Buscar cursos"
            placeholder="Asignatura o docente"
            value={searchInput}
            onChange={setSearchInput}
            onClear={() => {
              setSearchInput("");
              apply({ ...filters, search: "" });
            }}
            className={toolbar.search}
          />
          <TermSelect
            id="admin-courses-term"
            value={filters.term}
            terms={terms}
            current={current}
            onChange={(term) => apply({ ...filters, term })}
            className={toolbar.select}
          />
          <SelectField
            id="admin-courses-department"
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
          <ToggleChip
            pressed={filters.withoutTeacher}
            onClick={() => apply({ ...filters, withoutTeacher: !filters.withoutTeacher })}
          >
            Sin docente
          </ToggleChip>
          <ToggleChip
            pressed={filters.withoutMonitors}
            onClick={() => apply({ ...filters, withoutMonitors: !filters.withoutMonitors })}
          >
            Sin monitores
          </ToggleChip>
        </div>
        <div className={toolbar.summary}>
          <p className={toolbar.count} aria-live="polite">
            {list.data ? countLabel(list.data.count, "curso", "cursos") : ""}
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
            Nuevo curso
          </Button>
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}

      <DataTable
        label="Lista de cursos"
        caption="Cursos del período ordenados por asignatura y grupo. Selecciona uno para cambiar su grupo o su docente."
        loadingLabel="Cargando cursos…"
        paginationLabel="Paginación de cursos"
        columns={COLUMNS}
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
              title="Ningún curso coincide con los filtros."
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchInput("");
                    apply({
                      ...filters,
                      search: "",
                      department: null,
                      withoutTeacher: false,
                      withoutMonitors: false,
                    });
                  }}
                >
                  Limpiar filtros
                </Button>
              }
            >
              <p>Si buscabas huecos de cobertura, puede que este período ya no tenga ninguno.</p>
            </EmptyState>
          ) : (
            <EmptyState title="Este período aún no tiene cursos.">
              <p>Abre el primer grupo con «Nuevo curso».</p>
            </EmptyState>
          )
        }
        renderRow={(course) => (
          <tr
            key={course.id}
            data-selected={(panel?.mode === "edit" && panel.course.id === course.id) || undefined}
          >
            <th scope="row">
              <RowTrigger
                primary={course.subject.name}
                secondary={course.subject.code}
                disabled={drawer.busy}
                onClick={(event) => {
                  setNotice(null);
                  drawer.open({ mode: "edit", course }, event);
                }}
              />
            </th>
            <td className={styles.number}>{course.group}</td>
            <td>
              {course.teacher ? (
                <span className={styles.person}>
                  <span className={styles.personName}>{course.teacher.full_name}</span>
                  <span className={styles.personEmail}>{course.teacher.email}</span>
                </span>
              ) : (
                <span className={styles.warningTag}>Sin docente</span>
              )}
            </td>
            <td className={styles.number} data-zero={course.monitor_count === 0 || undefined}>
              {course.monitor_count}
            </td>
          </tr>
        )}
      />

      {panel?.mode === "create" && (
        <Drawer key="create" title="Nuevo curso" locked={drawer.busy} onClose={drawer.close}>
          <CourseCreateForm
            term={filters.term}
            terms={terms}
            current={current}
            onSaved={saved}
            onBusyChange={drawer.setBusy}
          />
        </Drawer>
      )}
      {panel?.mode === "edit" && (
        <Drawer
          key={panel.course.id}
          title="Editar curso"
          subtitle={`${panel.course.subject.code} · Grupo ${panel.course.group} · ${panel.course.term}`}
          locked={drawer.busy}
          onClose={drawer.close}
        >
          <CourseEditForm course={panel.course} onSaved={saved} onBusyChange={drawer.setBusy} />
        </Drawer>
      )}
    </div>
  );
}
