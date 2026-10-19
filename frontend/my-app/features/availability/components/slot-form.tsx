"use client";

import { type FormEvent, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import SelectField from "@/components/ui/select-field";
import TextField from "@/components/ui/text-field";
import {
  bogotaDateTime,
  createSlot,
  HALF_HOURS,
  isGroupSession,
  type Slot,
  toBogotaIso,
  updateSlot,
} from "@/lib/availability";
import type { MonitorOwnAssignment } from "@/lib/catalog";

import { availabilityFormErrors } from "../form-errors";
import { slotDayLabel, slotTimeRange } from "../labels";
import styles from "./availability.module.css";
import SessionFields, { capacityOf, sessionErrors, type SessionValues } from "./session-fields";

const FIELDS = ["subject", "starts_at", "modality", "location", "capacity"] as const;
type Errors = Partial<Record<(typeof FIELDS)[number] | "date", string[]>>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type SlotFormProps = {
  /** The slot being edited; absent to publish a new one. */
  slot?: Slot;
  /** The assignment whose subject the slot is for; the subject is fixed. */
  assignment: MonitorOwnAssignment;
  /** A new slot's Bogotá date and start, e.g. the free hour clicked on the calendar. */
  initial?: { date: string; time: string };
  onSaved: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
};

function initialSession(slot?: Slot): SessionValues {
  if (!slot) return { modality: "IN_PERSON", location: "", group: false, capacity: "" };
  const group = isGroupSession(slot.capacity);
  return {
    modality: slot.modality,
    location: slot.location,
    group,
    capacity: group ? String(slot.capacity) : "",
  };
}

/**
 * Publishes a one-off slot on the assignment's subject or edits an available one (T-03.16):
 * Bogotá date and start on the hour or half hour, modality, classroom or link, and the
 * session type. The API derives the end (60 min) and the term, and checks overlaps (RN-003.3).
 */
export default function SlotForm({
  slot,
  assignment,
  initial,
  onSaved,
  onBusyChange,
}: SlotFormProps) {
  const start = slot ? bogotaDateTime(slot.starts_at) : (initial ?? null);
  const subject = slot?.subject ?? assignment.subject;
  const [date, setDate] = useState(start?.date ?? "");
  const [time, setTime] = useState(start?.time ?? "");
  const [session, setSession] = useState<SessionValues>(() => initialSession(slot));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const editing = slot !== undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const missing: Errors = sessionErrors(session);
    if (!DATE_PATTERN.test(date)) missing.date = ["Elige la fecha de la sesión."];
    if (!HALF_HOURS.includes(time)) missing.starts_at = ["Elige la hora de inicio."];
    setErrors(missing);
    setFormError(null);
    const capacity = capacityOf(session);
    if (Object.keys(missing).length > 0 || capacity === null) return;

    const fields = {
      starts_at: toBogotaIso(date, time),
      modality: session.modality,
      location: session.location.trim(),
      capacity,
    };
    setSubmitting(true);
    onBusyChange(true);
    try {
      if (slot) {
        await updateSlot(slot.id, fields);
        onSaved(`Se actualizó la franja de ${slot.subject.code}.`);
      } else {
        const created = await createSlot({ subject: assignment.subject.id, ...fields });
        onSaved(
          `Se publicó la franja de ${created.subject.code} el ${slotDayLabel(created.starts_at)}, ${slotTimeRange(created.starts_at, created.ends_at)}.`,
        );
      }
    } catch (error) {
      // e.g. it overlaps another slot (400), the subject is not assigned (403) or the slot
      // is no longer available (409).
      const { byField, message } = availabilityFormErrors(error, FIELDS);
      // The subject is fixed text, so its errors go to the form alert (e.g. the date falls
      // in a term where the monitor is not assigned to it).
      const { subject: subjectErrors = [], ...rest } = byField;
      setErrors(rest);
      setFormError([...subjectErrors, message].filter(Boolean).join(" ") || null);
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      {formError && <Alert tone="error">{formError}</Alert>}
      <dl className={styles.fixed}>
        <dt>Asignatura</dt>
        <dd>{`${subject.code} · ${subject.name}`}</dd>
      </dl>

      <div className={styles.pair}>
        <TextField
          id="slot-date"
          label="Fecha"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          errors={errors.date}
          variant="glass"
        />
        <SelectField
          id="slot-time"
          label="Hora de inicio"
          variant="form"
          value={time}
          errors={errors.starts_at}
          onChange={setTime}
        >
          <option value="">Elige la hora</option>
          {HALF_HOURS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectField>
      </div>
      <p className={styles.hint}>Hora de Bogotá. Cada sesión dura 60 minutos.</p>

      <SessionFields idPrefix="slot" values={session} onChange={setSession} errors={errors} />

      <Button type="submit" softDisabled={submitting} className={styles.submit}>
        {submitting ? "Guardando…" : editing ? "Guardar cambios" : "Publicar franja"}
      </Button>
    </form>
  );
}
