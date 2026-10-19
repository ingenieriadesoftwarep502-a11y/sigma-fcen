"use client";

import { useEffect, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import DataTable from "@/components/ui/data-table";
import Drawer from "@/components/ui/drawer";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import SelectField from "@/components/ui/select-field";
import toolbar from "@/components/ui/toolbar.module.css";
import { requestErrorMessage } from "@/lib/api-client";
import {
  AVAILABILITY_PAGE_SIZE,
  cancelSlot,
  listMySlots,
  type MySlotFilters,
  type Slot,
  type SlotStatus,
} from "@/lib/availability";
import type { MonitorOwnAssignment } from "@/lib/catalog";
import { useDrawerState } from "@/lib/use-drawer-state";
import { usePagedList } from "@/lib/use-paged-list";

import {
  MODALITY_LABELS,
  sessionLabel,
  slotDayLabel,
  slotsCountLabel,
  slotTimeRange,
  STATUS_LABELS,
} from "../labels";
import styles from "./availability.module.css";
import SlotForm from "./slot-form";

type SlotsPanelProps = {
  /** The subject and term the slots belong to. */
  assignment: MonitorOwnAssignment;
};

type Panel = { kind: "create" } | { kind: "edit"; slot: Slot };

const COLUMNS = [
  { label: "Fecha y hora", className: styles.whenColumn },
  { label: "Sesión", className: styles.sessionColumn },
  { label: "Modalidad", className: styles.modalityColumn },
  { label: "Estado", className: styles.stateColumn },
  { label: "Acciones", className: styles.actionsColumn },
];

function sameFilters(a: MySlotFilters, b: MySlotFilters): boolean {
  return a.term === b.term && a.subject === b.subject && a.status === b.status;
}

function withdrawButtonId(slot: Slot): string {
  return `withdraw-slot-${slot.id}`;
}

function describe(slot: Slot): string {
  return `${slot.subject.code} el ${slotDayLabel(slot.starts_at)}, ${slotTimeRange(slot.starts_at, slot.ends_at)}`;
}

/**
 * The monitor's own slots of one assignment, its subject in its term, every state (T-03.16).
 * Only available slots can be edited or withdrawn; withdrawing cancels the slot and keeps
 * its record (FASE-03 G1).
 */
export default function SlotsPanel({ assignment }: SlotsPanelProps) {
  const initial: MySlotFilters = {
    term: assignment.term,
    subject: assignment.subject.id,
    status: null,
  };
  const list = usePagedList(listMySlots, initial, sameFilters);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Slot | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const restoreFocusTo = useRef<string | null>(null);
  const drawer = useDrawerState<Panel>(newButton);
  const filters = list.filters;

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
  }

  function cancelWithdraw(slot: Slot) {
    restoreFocusTo.current = withdrawButtonId(slot);
    setConfirming(null);
    setFailure(null);
  }

  async function withdraw(slot: Slot) {
    setWithdrawing(true);
    setFailure(null);
    try {
      await cancelSlot(slot.id);
    } catch (error) {
      setFailure(requestErrorMessage(error));
      setWithdrawing(false);
      return;
    }
    setWithdrawing(false);
    setConfirming(null);
    setNotice(`Se retiró la franja de ${describe(slot)}.`);
    newButton.current?.focus();
    list.reload();
  }

  const locked = drawer.busy || withdrawing;
  const panel = drawer.panel;

  return (
    <div className={styles.panel}>
      <div className={toolbar.toolbar} role="search" aria-label="Filtrar franjas">
        <div className={toolbar.filters}>
          <SelectField
            id="my-slots-status"
            label="Estado"
            value={filters.status ?? ""}
            onChange={(value) =>
              list.setFilters({ ...filters, status: (value || null) as SlotStatus | null })
            }
            className={toolbar.select}
          >
            <option value="">Todos los estados</option>
            {(Object.keys(STATUS_LABELS) as SlotStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </SelectField>
        </div>
        <div className={toolbar.summary}>
          <p className={toolbar.count} aria-live="polite">
            {list.data ? slotsCountLabel(list.data.count) : ""}
          </p>
          <Button
            ref={newButton}
            size="sm"
            disabled={drawer.busy}
            onClick={(event) => {
              setNotice(null);
              drawer.open({ kind: "create" }, event);
            }}
          >
            <Icon name="plus" />
            Publicar franja
          </Button>
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {failure && <Alert tone="error">{failure}</Alert>}

      <DataTable
        label="Lista de tus franjas"
        caption="Tus franjas de la asignatura en el período, en hora de Bogotá, con su tipo de sesión y su estado."
        loadingLabel="Cargando tus franjas…"
        paginationLabel="Paginación de franjas"
        columns={COLUMNS}
        tableClassName={styles.slotsTable}
        page={list.page}
        pageSize={AVAILABILITY_PAGE_SIZE}
        data={list.data}
        loading={list.loading}
        error={list.error}
        locked={locked}
        onPageChange={list.goTo}
        onRetry={list.reload}
        empty={
          filters.status ? (
            <EmptyState title="Ninguna franja tiene ese estado.">
              <p>Elige «Todos los estados» para ver todas tus franjas del período.</p>
            </EmptyState>
          ) : (
            <EmptyState title="Aún no has publicado franjas en este período.">
              <p>Publica una franja suelta o crea una plantilla semanal.</p>
            </EmptyState>
          )
        }
        renderRow={(slot) => {
          const isConfirming = confirming?.id === slot.id;
          const available = slot.status === "AVAILABLE";
          return (
            <tr key={slot.id} data-selected={isConfirming || undefined}>
              <th scope="row">
                <span className={styles.stack}>
                  <span className={styles.primary}>{slotDayLabel(slot.starts_at)}</span>
                  <span className={styles.secondary}>
                    {slotTimeRange(slot.starts_at, slot.ends_at)}
                  </span>
                </span>
              </th>
              <td>
                <span className={styles.session} data-group={slot.capacity > 1 || undefined}>
                  {sessionLabel(slot.capacity)}
                </span>
              </td>
              <td>
                <span className={styles.stack}>
                  <span>{MODALITY_LABELS[slot.modality]}</span>
                  <span className={styles.secondary} title={slot.location}>
                    {slot.location}
                  </span>
                </span>
              </td>
              <td>
                <span className={styles.status} data-status={slot.status}>
                  {STATUS_LABELS[slot.status]}
                </span>
              </td>
              <td>
                {available && (
                  <div className={styles.rowActions}>
                    {!isConfirming && (
                      <Button
                        variant="ghost"
                        size="sm"
                        softDisabled={locked}
                        aria-label={`Editar franja de ${describe(slot)}`}
                        aria-haspopup="dialog"
                        onClick={(event) => {
                          setNotice(null);
                          drawer.open({ kind: "edit", slot }, event);
                        }}
                      >
                        Editar
                      </Button>
                    )}
                    {/* Hidden rather than removed, so focus can come back to it. */}
                    <Button
                      id={withdrawButtonId(slot)}
                      variant="ghost"
                      size="sm"
                      hidden={isConfirming}
                      softDisabled={locked}
                      aria-label={`Retirar franja de ${describe(slot)}`}
                      onClick={() => {
                        setNotice(null);
                        setConfirming(slot);
                      }}
                    >
                      Retirar
                    </Button>
                    {isConfirming && (
                      <div className={styles.confirm} role="group" aria-label="Confirmar retiro">
                        <span className={styles.confirmText}>¿Retirar esta franja?</span>
                        <Button
                          ref={confirmButton}
                          variant="danger"
                          size="sm"
                          softDisabled={withdrawing}
                          onClick={() => withdraw(slot)}
                        >
                          {withdrawing ? "Retirando…" : "Confirmar retiro"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          softDisabled={withdrawing}
                          onClick={() => cancelWithdraw(slot)}
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

      {panel?.kind === "create" && (
        <Drawer title="Publicar franja" locked={drawer.busy} onClose={drawer.close}>
          <SlotForm assignment={assignment} onSaved={saved} onBusyChange={drawer.setBusy} />
        </Drawer>
      )}
      {panel?.kind === "edit" && (
        <Drawer
          title="Editar franja"
          subtitle={describe(panel.slot)}
          locked={drawer.busy}
          onClose={drawer.close}
        >
          <SlotForm
            slot={panel.slot}
            assignment={assignment}
            onSaved={saved}
            onBusyChange={drawer.setBusy}
          />
        </Drawer>
      )}
    </div>
  );
}
