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
import SubjectSelect from "./subject-select";

const FIELDS = ["subject", "starts_at", "modality", "location", "capacity"] as const;
type Errors = Partial<Record<(typeof FIELDS)[number] | "date", string[]>>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type SlotFormProps = {
  /** The slot being edited; absent to publish a new one. */
  slot?: Slot;
  /** The monitor's assignments of the term, the subjects they may publish on. */
  assignments: MonitorOwnAssignment[] | null;
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
 * Publishes a one-off slot or edits an available one (T-03.16): subject, Bogotá date and
 * start on the hour or half hour, modality, classroom or link, and the session type.
 * The API derives the end (60 min) and the term, and checks overlaps (RN-003.3).
 */
export default function SlotForm({ slot, assignments, onSaved, onBusyChange }: SlotFormProps) {
  const start = slot ? bogotaDateTime(slot.starts_at) : null;
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(start?.date ?? "");
  const [time, setTime] = useState(start?.time ?? "");
  const [session, setSession] = useState<SessionValues>(() => initialSession(slot));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const editing = slot !== undefined;
  const noSubjects = !editing && assignments !== null && assignments.length === 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || noSubjects) return;
    const missing: Errors = sessionErrors(session);
    if (!editing && !subject) missing.subject = ["Elige una de tus asignaturas."];
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
        const created = await createSlot({ subject: Number(subject), ...fields });
        onSaved(
          `Se publicó la franja de ${created.subject.code} el ${slotDayLabel(created.starts_at)}, ${slotTimeRange(created.starts_at, created.ends_at)}.`,
        );
      }
    } catch (error) {
      // e.g. it overlaps another slot (400), the subject is not assigned (403) or the slot
      // is no longer available (409).
      const { byField, message } = availabilityFormErrors(error, FIELDS);
      const { subject: subjectErrors, ...rest } = byField;
      if (editing && subjectErrors) {
        // The edit form shows the subject as fixed text, so its errors go to the form alert
        // (e.g. a new date falls in a term where the monitor is not assigned to it).
        setErrors(rest);
        setFormError([...subjectErrors, message].filter(Boolean).join(" "));
      } else {
        setErrors(byField);
        setFormError(message);
      }
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      {formError && <Alert tone="error">{formError}</Alert>}
      {noSubjects && (
        <Alert tone="error">
          No tienes asignaturas asignadas en este período. Pide a la coordinación que registre tu
          monitoría para publicar franjas.
        </Alert>
      )}

      {slot ? (
        <dl className={styles.fixed}>
          <dt>Asignatura</dt>
          <dd>{`${slot.subject.code} · ${slot.subject.name}`}</dd>
        </dl>
      ) : (
        <SubjectSelect
          id="slot-subject"
          value={subject}
          assignments={assignments}
          onChange={setSubject}
          errors={errors.subject}
        />
      )}

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

      <Button type="submit" softDisabled={submitting || noSubjects} className={styles.submit}>
        {submitting ? "Guardando…" : editing ? "Guardar cambios" : "Publicar franja"}
      </Button>
    </form>
  );
}
