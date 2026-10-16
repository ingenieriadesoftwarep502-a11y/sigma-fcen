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
import SubjectSelect from "./subject-select";

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
  /** Code of the term the template fills; null while the current term is unknown. */
  term: string | null;
  assignments: MonitorOwnAssignment[] | null;
  onSaved: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
};

/**
 * Creates a weekly template (T-03.16, ADR-010 condition c): the API publishes one slot on
 * that weekday and hour for every remaining week of the term, all or nothing. When some week
 * collides with another slot, nothing is created and the colliding weeks are listed.
 */
export default function TemplateForm({ term, assignments, onSaved, onBusyChange }: TemplateFormProps) {
  const [subject, setSubject] = useState("");
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
  const noSubjects = assignments !== null && assignments.length === 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || noSubjects) return;
    const missing: Errors = sessionErrors(session);
    if (!subject) missing.subject = ["Elige una de tus asignaturas."];
    if (!/^[0-6]$/.test(weekday)) missing.weekday = ["Elige el día de la semana."];
    if (!HALF_HOURS.includes(time)) missing.start_time = ["Elige la hora de inicio."];
    if (!term) missing.term = ["Aún no se conoce el período; inténtalo de nuevo en un momento."];
    setErrors(missing);
    setFormError(null);
    const capacity = capacityOf(session);
    if (Object.keys(missing).length > 0 || capacity === null || !term) return;

    setSubmitting(true);
    onBusyChange(true);
    try {
      const created = await createTemplate({
        subject: Number(subject),
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
      setErrors(byField);
      setFormError(message);
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
          monitoría para crear plantillas.
        </Alert>
      )}
      {errors.term && <Alert tone="error">{errors.term.join(" ")}</Alert>}

      <SubjectSelect
        id="template-subject"
        value={subject}
        assignments={assignments}
        onChange={setSubject}
        errors={errors.subject}
      />

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
        {term
          ? `Se publicará una franja de 60 minutos cada semana, desde hoy hasta el fin del período ${term}. Hora de Bogotá.`
          : "Se publicará una franja de 60 minutos cada semana, desde hoy hasta el fin del período. Hora de Bogotá."}
      </p>

      <SessionFields idPrefix="template" values={session} onChange={setSession} errors={errors} />

      <Button type="submit" softDisabled={submitting || noSubjects} className={styles.submit}>
        {submitting ? "Creando…" : "Crear plantilla"}
      </Button>
    </form>
  );
}
