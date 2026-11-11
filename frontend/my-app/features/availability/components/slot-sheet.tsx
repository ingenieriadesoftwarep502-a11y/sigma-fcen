"use client";

import { useEffect, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { requestErrorMessage } from "@/lib/api-client";
import { cancelSlot, type Slot } from "@/lib/availability";
import type { MonitorOwnAssignment } from "@/lib/catalog";

import {
  durationLabel,
  locationLabel,
  MODALITY_LABELS,
  sessionLabel,
  slotDayLabel,
  slotTimeRange,
  STATUS_LABELS,
} from "../labels";
import SlotForm from "./slot-form";
import styles from "./slot-sheet.module.css";

type SlotSheetProps = {
  slot: Slot;
  assignment: MonitorOwnAssignment;
  /** Something changed; the message says what. */
  onChanged: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
};

/** "el martes, 20 de octubre, 10:00–11:00". */
export function describeSlot(slot: Slot): string {
  return `el ${slotDayLabel(slot.starts_at)}, ${slotTimeRange(slot.starts_at, slot.ends_at)}`;
}

/**
 * One of the monitor's slots inside its drawer: what, when and where, and, while it is still
 * available, editing it or withdrawing it (T-03.16). Withdrawing cancels the slot and keeps
 * its record (FASE-03 G1). Container: owns the mode and the withdrawal.
 */
export default function SlotSheet({ slot, assignment, onChanged, onBusyChange }: SlotSheetProps) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [withdrawing, setWithdrawing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const available = slot.status === "AVAILABLE";

  useEffect(() => {
    if (mode === "confirm") confirmButton.current?.focus();
  }, [mode]);

  async function withdraw() {
    setWithdrawing(true);
    setFailure(null);
    onBusyChange(true);
    try {
      await cancelSlot(slot.id);
    } catch (error) {
      setFailure(requestErrorMessage(error));
      setWithdrawing(false);
      onBusyChange(false);
      return;
    }
    onBusyChange(false);
    onChanged(`Se retiró la franja ${describeSlot(slot)}.`);
  }

  if (mode === "edit") {
    return (
      <div className={styles.sheet}>
        <button type="button" className={styles.back} onClick={() => setMode("view")}>
          <Icon name="chevron" size={16} className={styles.backIcon} />
          Volver al detalle
        </button>
        <SlotForm
          slot={slot}
          assignment={assignment}
          onSaved={onChanged}
          onBusyChange={onBusyChange}
        />
      </div>
    );
  }

  return (
    <div className={styles.sheet}>
      <div className={styles.hero}>
        <span className={styles.status} data-status={slot.status}>
          {STATUS_LABELS[slot.status]}
        </span>
        <p className={styles.range}>{slotTimeRange(slot.starts_at, slot.ends_at)}</p>
        <p className={styles.day}>{slotDayLabel(slot.starts_at)}</p>
      </div>

      <dl className={styles.facts}>
        <div>
          <dt>
            <Icon name="clock" size={16} />
            Duración
          </dt>
          <dd>{durationLabel(slot.starts_at, slot.ends_at)}</dd>
        </div>
        <div>
          <dt>
            <Icon name={slot.modality === "VIRTUAL" ? "video" : "place"} size={16} />
            {MODALITY_LABELS[slot.modality]}
          </dt>
          <dd className={styles.location}>
            <span className={styles.locationLabel}>{locationLabel(slot.modality)}</span>
            {slot.location}
          </dd>
        </div>
        <div>
          <dt>
            <Icon name="users" size={16} />
            Sesión
          </dt>
          <dd>{sessionLabel(slot.capacity)}</dd>
        </div>
        {slot.template !== null && (
          <div>
            <dt>
              <Icon name="repeat" size={16} />
              Origen
            </dt>
            <dd>Plantilla semanal</dd>
          </div>
        )}
      </dl>

      {failure && <Alert tone="error">{failure}</Alert>}

      {available ? (
        mode === "confirm" ? (
          <div className={styles.confirm} role="group" aria-label="Confirmar retiro">
            <p className={styles.confirmText}>
              Los estudiantes dejarán de verla. La franja queda registrada como retirada.
            </p>
            <div className={styles.actions}>
              <Button
                ref={confirmButton}
                variant="danger"
                softDisabled={withdrawing}
                onClick={withdraw}
              >
                {withdrawing ? "Retirando…" : "Confirmar retiro"}
              </Button>
              <Button variant="ghost" softDisabled={withdrawing} onClick={() => setMode("view")}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.actions}>
            <Button onClick={() => setMode("edit")}>
              <Icon name="edit" />
              Editar franja
            </Button>
            <Button variant="ghost" onClick={() => setMode("confirm")}>
              <Icon name="trash" />
              Retirar
            </Button>
          </div>
        )
      ) : (
        <p className={styles.note}>
          {slot.status === "RESERVED"
            ? "Todos sus cupos están reservados: ya no se puede editar ni retirar."
            : "Solo las franjas disponibles se pueden editar o retirar."}
        </p>
      )}
    </div>
  );
}
