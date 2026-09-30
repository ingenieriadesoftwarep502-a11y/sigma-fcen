"use client";

import { type FormEvent, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import TextField from "@/components/ui/text-field";
import { formErrors } from "@/lib/api-client";
import { createAssignment, type Term } from "@/lib/catalog";

import styles from "./catalog-form.module.css";
import { type PersonOption, PersonPicker, type SubjectOption, SubjectPicker } from "./pickers";
import TermSelect from "./term-select";

const FIELDS = ["monitor", "subject", "term", "committed_hours"] as const;
type Errors = Partial<Record<(typeof FIELDS)[number], string[]>>;

/** The API stores hours as a positive small integer. */
const MAX_HOURS = 32767;

type AssignmentFormProps = {
  /** The term the list shows; the assignment goes there unless another is chosen. */
  term: string | null;
  terms: Term[] | null;
  current: Term | null;
  onSaved: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
};

/** Authorizes a monitor for a subject in a term, with the hours they commit (RF-023). */
export default function AssignmentForm({
  term: initialTerm,
  terms,
  current,
  onSaved,
  onBusyChange,
}: AssignmentFormProps) {
  const [monitor, setMonitor] = useState<PersonOption | null>(null);
  const [subject, setSubject] = useState<SubjectOption | null>(null);
  const [term, setTerm] = useState<string | null>(initialTerm);
  const [hours, setHours] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const termCode = term ?? current?.code ?? null;
    const committed = /^\d+$/.test(hours.trim()) ? Number(hours) : 0;
    const missing: Errors = {};
    if (!monitor) missing.monitor = ["Elige un monitor de la lista."];
    if (!subject) missing.subject = ["Elige una asignatura de la lista."];
    if (!termCode) missing.term = ["Elige el período."];
    if (committed < 1 || committed > MAX_HOURS) {
      missing.committed_hours = ["Ingresa un número entero de horas mayor que cero."];
    }
    setErrors(missing);
    setFormError(null);
    if (!monitor || !subject || !termCode || Object.keys(missing).length > 0) return;

    setSubmitting(true);
    onBusyChange(true);
    try {
      await createAssignment({
        monitor: monitor.id,
        subject: subject.id,
        term: termCode,
        committed_hours: committed,
      });
      onSaved(`Se asignó a ${monitor.name} en ${subject.code}.`);
    } catch (error) {
      // e.g. the account lacks the MONITOR role, or the monitor is already assigned.
      const { byField, message } = formErrors(error, FIELDS);
      setErrors(byField);
      setFormError(message);
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      {formError && <Alert tone="error">{formError}</Alert>}
      <PersonPicker
        id="assignment-monitor"
        role="MONITOR"
        label="Monitor"
        value={monitor}
        onChange={setMonitor}
        errors={errors.monitor}
      />
      <SubjectPicker
        id="assignment-subject"
        label="Asignatura"
        value={subject}
        onChange={setSubject}
        errors={errors.subject}
      />
      <div className={styles.pair}>
        <TermSelect
          id="assignment-term"
          variant="form"
          value={term}
          terms={terms}
          current={current}
          onChange={setTerm}
          errors={errors.term}
        />
        <TextField
          id="assignment-hours"
          label="Horas comprometidas"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          errors={errors.committed_hours}
          variant="glass"
        />
      </div>
      <p className={styles.hint}>
        Las horas comprometidas alimentan el indicador de cumplimiento del monitor.
      </p>
      <Button type="submit" softDisabled={submitting} className={styles.submit}>
        {submitting ? "Guardando…" : "Guardar asignación"}
      </Button>
    </form>
  );
}
