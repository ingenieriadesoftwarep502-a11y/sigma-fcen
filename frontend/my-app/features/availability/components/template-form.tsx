"use client";

import { type FormEvent, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import SelectField from "@/components/ui/select-field";
import { createTemplate, HALF_HOURS } from "@/lib/availability";
import type { MonitorOwnAssignment } from "@/lib/catalog";

import { availabilityFormErrors } from "../form-errors";
import { slotsCountLabel, WEEKDAY_LABELS } from "../labels";
import styles from "./availability.module.css";
import SessionFields, { capacityOf, sessionErrors, type SessionValues } from "./session-fields";

const FIELDS = [
  "subject",
  "term",
  "weekday",
  "start_time",
  "modality",
  "location",
  "capacity",
] as const;
type Errors = Partial<Record<(typeof FIELDS)[number], string[]>>;

type TemplateFormProps = {
  /** The assignment whose subject and term the template fills; both are fixed. */
  assignment: MonitorOwnAssignment;
  onSaved: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
};

/**
 * Creates a weekly template (T-03.16, ADR-010 condition c): the API publishes one slot on
 * that weekday and hour for every remaining week of the term, all or nothing. When some week
 * collides with another slot, nothing is created and the colliding weeks are listed.
 */
export default function TemplateForm({ assignment, onSaved, onBusyChange }: TemplateFormProps) {
  const { subject, term } = assignment;
  const [weekday, setWeekday] = useState("");
  const [time, setTime] = useState("");
  const [session, setSession] = useState<SessionValues>({
    modality: "IN_PERSON",
    location: "",
    group: false,
    capacity: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const missing: Errors = sessionErrors(session);
    if (!/^[0-6]$/.test(weekday)) missing.weekday = ["Elige el día de la semana."];
    if (!HALF_HOURS.includes(time)) missing.start_time = ["Elige la hora de inicio."];
    setErrors(missing);
    setFormError(null);
    const capacity = capacityOf(session);
    if (Object.keys(missing).length > 0 || capacity === null) return;

    setSubmitting(true);
    onBusyChange(true);
    try {
      const created = await createTemplate({
        subject: subject.id,
        term,
        weekday: Number(weekday),
        start_time: time,
        modality: session.modality,
        location: session.location.trim(),
        capacity,
      });
      onSaved(
        `Se creó la plantilla de ${created.subject.code} y se publicaron ${slotsCountLabel(created.slots_created)}.`,
      );
    } catch (error) {
      const { byField, message } = availabilityFormErrors(error, FIELDS);
      // Subject and term are fixed text, so their errors go to the form alert.
      const { subject: subjectErrors = [], term: termErrors = [], ...rest } = byField;
      setErrors(rest);
      setFormError([...subjectErrors, ...termErrors, message].filter(Boolean).join(" ") || null);
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
        <dt>Período</dt>
        <dd>{term}</dd>
      </dl>

      <div className={styles.pair}>
        <SelectField
          id="template-weekday"
          label="Día de la semana"
          variant="form"
          value={weekday}
          errors={errors.weekday}
          onChange={setWeekday}
        >
          <option value="">Elige el día</option>
          {WEEKDAY_LABELS.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="template-time"
          label="Hora de inicio"
          variant="form"
          value={time}
          errors={errors.start_time}
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
      <p className={styles.hint}>
        {`Se publicará una franja de 60 minutos cada semana, desde hoy hasta el fin del período ${term}. Hora de Bogotá.`}
      </p>

      <SessionFields idPrefix="template" values={session} onChange={setSession} errors={errors} />

      <Button type="submit" softDisabled={submitting} className={styles.submit}>
        {submitting ? "Creando…" : "Crear plantilla"}
      </Button>
    </form>
  );
}
