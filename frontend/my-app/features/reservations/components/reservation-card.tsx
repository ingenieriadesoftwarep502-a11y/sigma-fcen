"use client";

import { useEffect, useRef } from "react";

import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { MODALITY_LABELS, slotDayLabel, slotTimeRange } from "@/features/availability/labels";
import { formatDateTime } from "@/lib/format";
import {
  CANCEL_WINDOW_HOURS,
  cancelsAsNoShow,
  hasStarted,
  MAX_REASON_LENGTH,
  type Reservation,
} from "@/lib/reservations";

import { RESERVATION_STATUS_LABELS } from "../labels";
import styles from "./my-reservations.module.css";

/** Whose eyes the reservation is seen through: the one who booked, or the slot's monitor. */
export type Viewer = "student" | "monitor";

export type CancelStep = {
  reason: string;
  reasonError: string | null;
  working: boolean;
};

type ReservationCardProps = {
  reservation: Reservation;
  viewer: Viewer;
  /** Present while the cancellation is being confirmed. */
  cancelling: CancelStep | null;
  onAsk: () => void;
  onBack: () => void;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
};

/**
 * One reservation: when, where, with whom, its state and how it ended. A CONFIRMED one that
 * has not started offers "Cancelar reserva", confirmed in place (ADR-011). Presentational.
 */
export default function ReservationCard({
  reservation,
  viewer,
  cancelling,
  onAsk,
  onBack,
  onReasonChange,
  onConfirm,
}: ReservationCardProps) {
  const { slot, status } = reservation;
  const range = slotTimeRange(slot.starts_at, slot.ends_at);
  const virtual = slot.modality === "VIRTUAL";
  const cancellable = status === "CONFIRMED" && !hasStarted(slot.starts_at);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const asking = cancelling !== null;
  const reasonId = `reason-${reservation.id}`;

  useEffect(() => {
    if (asking && viewer === "student") confirmButton.current?.focus();
  }, [asking, viewer]);

  return (
    <article className={styles.card} data-status={status}>
      <header className={styles.cardHeader}>
        <div>
          <p className={styles.code}>{slot.subject.code}</p>
          <h2 className={styles.subject}>{slot.subject.name}</h2>
        </div>
        <span className={styles.status} data-status={status}>
          {RESERVATION_STATUS_LABELS[status]}
        </span>
      </header>

      <p className={styles.when}>
        <Icon name="clock" size={14} />
        <span className={styles.day}>{slotDayLabel(slot.starts_at)}</span>
        <span>{range}</span>
      </p>
      <p className={styles.where}>
        <Icon name={virtual ? "video" : "place"} size={14} />
        <span className={styles.place} title={slot.location}>
          {`${MODALITY_LABELS[slot.modality]} · ${slot.location}`}
        </span>
      </p>
      <p className={styles.who}>
        <Icon name="users" size={14} />
        {viewer === "student"
          ? `Con ${slot.monitor.full_name || "monitor sin nombre"}`
          : `Reservó ${reservation.student.full_name || "un estudiante"}`}
      </p>

      {reservation.student_note && (
        <p className={styles.note}>
          {viewer === "student"
            ? `Tu nota: “${reservation.student_note}”`
            : `Nota de ${reservation.student.full_name || "el estudiante"}: “${reservation.student_note}”`}
        </p>
      )}

      {reservation.cancelled_by && reservation.cancelled_at && (
        <div className={styles.ended}>
          <p>
            {`Cancelada por ${reservation.cancelled_by.full_name || "alguien sin nombre"} · ${formatDateTime(reservation.cancelled_at)}`}
          </p>
          {reservation.cancellation_reason && (
            <p className={styles.reason}>“{reservation.cancellation_reason}”</p>
          )}
        </div>
      )}

      {cancellable && !asking && (
        <Button
          variant="ghost"
          size="sm"
          className={styles.cancel}
          aria-label={`Cancelar reserva de ${slot.subject.name}, ${range}`}
          onClick={onAsk}
        >
          Cancelar reserva
        </Button>
      )}

      {cancellable && cancelling && (
        <div className={styles.confirm} role="group" aria-label="Confirmar cancelación">
          {viewer === "student" ? (
            <p>
              {cancelsAsNoShow(slot.starts_at)
                ? `Faltan menos de ${CANCEL_WINDOW_HOURS} horas: quedará registrada como inasistencia en tu historial. `
                : ""}
              Tu cupo quedará libre para otra persona.
            </p>
          ) : (
            <>
              <p>{`${reservation.student.full_name || "El estudiante"} verá tu justificación.`}</p>
              <label htmlFor={reasonId} className={styles.reasonLabel}>
                Justificación
              </label>
              <textarea
                id={reasonId}
                className={styles.reasonInput}
                rows={3}
                maxLength={MAX_REASON_LENGTH}
                value={cancelling.reason}
                aria-invalid={cancelling.reasonError !== null}
                aria-describedby={cancelling.reasonError ? `${reasonId}-error` : undefined}
                onChange={(event) => onReasonChange(event.target.value)}
              />
              {cancelling.reasonError && (
                <p id={`${reasonId}-error`} className={styles.reasonError}>
                  {cancelling.reasonError}
                </p>
              )}
            </>
          )}
          <div className={styles.confirmActions}>
            <Button
              ref={confirmButton}
              variant="danger"
              size="sm"
              softDisabled={cancelling.working}
              onClick={onConfirm}
            >
              {cancelling.working ? "Cancelando…" : "Sí, cancelar"}
            </Button>
            <Button variant="ghost" size="sm" softDisabled={cancelling.working} onClick={onBack}>
              Volver
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
