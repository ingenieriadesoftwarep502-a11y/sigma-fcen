"use client";

import { useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import { ActiveState } from "@/components/ui/data-table";
import Drawer from "@/components/ui/drawer";
import Icon from "@/components/ui/icon";
import type { Department, Term } from "@/lib/catalog";
import { formatDay } from "@/lib/format";
import { useDrawerState } from "@/lib/use-drawer-state";

import styles from "./catalog-admin.module.css";
import { DepartmentForm, TermForm } from "./organization-forms";

type Panel =
  | { mode: "new-department" }
  | { mode: "edit-department"; department: Department }
  | { mode: "new-term" };

type OrganizationPanelProps = {
  departments: Department[] | null;
  departmentsError: string | null;
  terms: Term[] | null;
  current: Term | null;
  termsError: string | null;
  onDepartmentsChange: () => void;
  onTermsChange: () => void;
};

function ListSkeleton() {
  return (
    <div className={styles.listSkeleton} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

/** The two short reference lists every other tab depends on: departments and terms. */
export default function OrganizationPanel({
  departments,
  departmentsError,
  terms,
  current,
  termsError,
  onDepartmentsChange,
  onTermsChange,
}: OrganizationPanelProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const fallback = useRef<HTMLButtonElement>(null);
  const drawer = useDrawerState<Panel>(fallback);
  const panel = drawer.panel;

  function saved(message: string, refresh: () => void) {
    setNotice(message);
    drawer.close();
    refresh();
  }

  return (
    <div className={styles.panel}>
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className={styles.organization}>
        <section className={styles.block} aria-labelledby="departments-title">
          <header className={styles.blockHeader}>
            <h2 id="departments-title" className={styles.blockTitle}>
              Departamentos
            </h2>
            <Button
              ref={fallback}
              variant="ghost"
              size="sm"
              disabled={drawer.busy}
              onClick={(event) => {
                setNotice(null);
                drawer.open({ mode: "new-department" }, event);
              }}
            >
              <Icon name="plus" />
              Nuevo departamento
            </Button>
          </header>
          {departmentsError && <Alert tone="error">{departmentsError}</Alert>}
          {!departments && !departmentsError && <ListSkeleton />}
          {departments && departments.length === 0 && (
            <p className={styles.blockEmpty}>Aún no hay departamentos. Crea el primero.</p>
          )}
          {departments && departments.length > 0 && (
            <ul className={styles.rows} aria-label="Departamentos">
              {departments.map((department) => (
                <li key={department.id} className={styles.row}>
                  <span className={styles.person}>
                    <span className={styles.personName}>{department.name}</span>
                    <span className={styles.personEmail}>{department.code}</span>
                  </span>
                  <ActiveState
                    active={department.is_active !== false}
                    labels={["Activo", "Inactivo"]}
                  />
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Editar ${department.name}`}
                    aria-haspopup="dialog"
                    disabled={drawer.busy}
                    onClick={(event) => {
                      setNotice(null);
                      drawer.open({ mode: "edit-department", department }, event);
                    }}
                  >
                    <Icon name="edit" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.block} aria-labelledby="terms-title">
          <header className={styles.blockHeader}>
            <h2 id="terms-title" className={styles.blockTitle}>
              Períodos
            </h2>
            <Button
              variant="ghost"
              size="sm"
              disabled={drawer.busy}
              onClick={(event) => {
                setNotice(null);
                drawer.open({ mode: "new-term" }, event);
              }}
            >
              <Icon name="plus" />
              Nuevo período
            </Button>
          </header>
          {termsError && <Alert tone="error">{termsError}</Alert>}
          {!terms && !termsError && <ListSkeleton />}
          {terms && terms.length === 0 && (
            <p className={styles.blockEmpty}>
              Aún no hay períodos. Sin un período no se pueden abrir cursos ni asignar monitores.
            </p>
          )}
          {terms && terms.length > 0 && (
            <ul className={styles.rows} aria-label="Períodos">
              {terms.map((term) => (
                <li key={term.id} className={styles.row}>
                  <span className={styles.termCode}>{term.code}</span>
                  <span className={styles.dates}>
                    <time dateTime={term.start_date}>{formatDay(term.start_date)}</time>
                    {" – "}
                    <time dateTime={term.end_date}>{formatDay(term.end_date)}</time>
                  </span>
                  {term.id === current?.id ? (
                    <span className={styles.currentTag}>Actual</span>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {panel?.mode === "new-department" && (
        <Drawer key="new-department" title="Nuevo departamento" locked={drawer.busy} onClose={drawer.close}>
          <DepartmentForm
            onSaved={(message) => saved(message, onDepartmentsChange)}
            onBusyChange={drawer.setBusy}
          />
        </Drawer>
      )}
      {panel?.mode === "edit-department" && (
        <Drawer
          key={panel.department.id}
          title="Editar departamento"
          subtitle={panel.department.code}
          locked={drawer.busy}
          onClose={drawer.close}
        >
          <DepartmentForm
            department={panel.department}
            onSaved={(message) => saved(message, onDepartmentsChange)}
            onBusyChange={drawer.setBusy}
          />
        </Drawer>
      )}
      {panel?.mode === "new-term" && (
        <Drawer key="new-term" title="Nuevo período" locked={drawer.busy} onClose={drawer.close}>
          <TermForm
            onSaved={(message) => saved(message, onTermsChange)}
            onBusyChange={drawer.setBusy}
          />
        </Drawer>
      )}
    </div>
  );
}
