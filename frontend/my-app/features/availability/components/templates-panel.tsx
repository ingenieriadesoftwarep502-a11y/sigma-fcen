"use client";

import { useEffect, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import DataTable from "@/components/ui/data-table";
import Drawer from "@/components/ui/drawer";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import toolbar from "@/components/ui/toolbar.module.css";
import { requestErrorMessage } from "@/lib/api-client";
import {
  AVAILABILITY_PAGE_SIZE,
  deactivateTemplate,
  listMyTemplates,
  type SlotTemplate,
  type TemplateFilters,
} from "@/lib/availability";
import type { MonitorOwnAssignment } from "@/lib/catalog";
import { useDrawerState } from "@/lib/use-drawer-state";
import { usePagedList } from "@/lib/use-paged-list";

import {
  MODALITY_LABELS,
  sessionLabel,
  slotsCountLabel,
  templateTimeRange,
  WEEKDAY_LABELS,
} from "../labels";
import styles from "./availability.module.css";
import TemplateForm from "./template-form";

type TemplatesPanelProps = {
  /** The subject and term the templates belong to. */
  assignment: MonitorOwnAssignment;
};

const COLUMNS = [
  { label: "Día y hora", className: styles.whenColumn },
  { label: "Sesión", className: styles.sessionColumn },
  { label: "Modalidad", className: styles.modalityColumn },
  { label: "Franjas", className: styles.countColumn },
  { label: "Estado", className: styles.stateColumn },
  { label: "Acciones", className: styles.actionsColumn },
];

function sameFilters(a: TemplateFilters, b: TemplateFilters): boolean {
  return a.term === b.term && a.subject === b.subject;
}

function deactivateButtonId(template: SlotTemplate): string {
  return `deactivate-template-${template.id}`;
}

function describe(template: SlotTemplate): string {
  const weekday = WEEKDAY_LABELS[template.weekday]?.toLowerCase() ?? "";
  return `${template.subject.code}, ${weekday} ${template.start_time.slice(0, 5)}`;
}

/**
 * The monitor's weekly templates of one assignment, its subject in its term (T-03.16).
 * Deactivating one withdraws its future slots that hold no reservation; past and reserved
 * ones stay.
 */
export default function TemplatesPanel({ assignment }: TemplatesPanelProps) {
  const list = usePagedList(
    listMyTemplates,
    { term: assignment.term, subject: assignment.subject.id },
    sameFilters,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<SlotTemplate | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const restoreFocusTo = useRef<string | null>(null);
  const drawer = useDrawerState<"create">(newButton);

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
  }

  function cancelDeactivate(template: SlotTemplate) {
    restoreFocusTo.current = deactivateButtonId(template);
    setConfirming(null);
    setFailure(null);
  }

  async function deactivate(template: SlotTemplate) {
    setDeactivating(true);
    setFailure(null);
    try {
      await deactivateTemplate(template.id);
    } catch (error) {
      setFailure(requestErrorMessage(error));
      setDeactivating(false);
      return;
    }
    setDeactivating(false);
    setConfirming(null);
    setNotice(
      `Se desactivó la plantilla de ${describe(template)}. Sus franjas futuras sin reserva se retiraron.`,
    );
    newButton.current?.focus();
    list.reload();
  }

  const locked = drawer.busy || deactivating;

  return (
    <div className={styles.panel}>
      <div className={toolbar.toolbar}>
        <p className={styles.panelLead}>
          Una plantilla publica la misma franja cada semana hasta el fin del período.
        </p>
        <div className={toolbar.summary}>
          <p className={toolbar.count} aria-live="polite">
            {list.data
              ? `${list.data.count} ${list.data.count === 1 ? "plantilla" : "plantillas"}`
              : ""}
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
            Nueva plantilla
          </Button>
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {failure && <Alert tone="error">{failure}</Alert>}

      <DataTable
        label="Lista de tus plantillas semanales"
        caption="Tus plantillas semanales de la asignatura en el período, con las franjas que generó cada una."
        loadingLabel="Cargando tus plantillas…"
        paginationLabel="Paginación de plantillas"
        columns={COLUMNS}
        tableClassName={styles.templatesTable}
        page={list.page}
        pageSize={AVAILABILITY_PAGE_SIZE}
        data={list.data}
        loading={list.loading}
        error={list.error}
        locked={locked}
        onPageChange={list.goTo}
        onRetry={list.reload}
        empty={
          <EmptyState title="Aún no tienes plantillas en este período.">
            <p>Crea una con «Nueva plantilla» para publicar la misma franja cada semana.</p>
          </EmptyState>
        }
        renderRow={(template) => {
          const isConfirming = confirming?.id === template.id;
          return (
            <tr key={template.id} data-selected={isConfirming || undefined}>
              <th scope="row">
                <span className={styles.stack}>
                  <span className={styles.primary}>{WEEKDAY_LABELS[template.weekday]}</span>
                  <span className={styles.secondary}>{templateTimeRange(template.start_time)}</span>
                </span>
              </th>
              <td>
                <span className={styles.session} data-group={template.capacity > 1 || undefined}>
                  {sessionLabel(template.capacity)}
                </span>
              </td>
              <td>
                <span className={styles.stack}>
                  <span>{MODALITY_LABELS[template.modality]}</span>
                  <span className={styles.secondary} title={template.location}>
                    {template.location}
                  </span>
                </span>
              </td>
              <td className={styles.number}>{slotsCountLabel(template.slots_created)}</td>
              <td>
                <span
                  className={styles.status}
                  data-status={template.is_active ? "AVAILABLE" : "CANCELLED"}
                >
                  {template.is_active ? "Activa" : "Inactiva"}
                </span>
              </td>
              <td>
                {template.is_active && (
                  <div className={styles.rowActions}>
                    <Button
                      id={deactivateButtonId(template)}
                      variant="ghost"
                      size="sm"
                      hidden={isConfirming}
                      softDisabled={locked}
                      aria-label={`Desactivar plantilla de ${describe(template)}`}
                      onClick={() => {
                        setNotice(null);
                        setConfirming(template);
                      }}
                    >
                      Desactivar
                    </Button>
                    {isConfirming && (
                      <div
                        className={styles.confirm}
                        role="group"
                        aria-label="Confirmar desactivación"
                      >
                        <span className={styles.confirmText}>
                          ¿Desactivar y retirar sus franjas futuras?
                        </span>
                        <Button
                          ref={confirmButton}
                          variant="danger"
                          size="sm"
                          softDisabled={deactivating}
                          onClick={() => deactivate(template)}
                        >
                          {deactivating ? "Desactivando…" : "Confirmar desactivación"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          softDisabled={deactivating}
                          onClick={() => cancelDeactivate(template)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </td>
            </tr>
          );
        }}
      />

      {drawer.panel === "create" && (
        <Drawer title="Nueva plantilla semanal" locked={drawer.busy} onClose={drawer.close}>
          <TemplateForm
            assignment={assignment}
            onSaved={saved}
            onBusyChange={drawer.setBusy}
          />
        </Drawer>
      )}
    </div>
  );
}
