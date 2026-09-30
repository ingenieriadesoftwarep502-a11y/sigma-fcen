"use client";

import { type FormEvent, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import TextField from "@/components/ui/text-field";
import { formErrors } from "@/lib/api-client";
import {
  createDepartment,
  createTerm,
  type Department,
  type DepartmentChanges,
  isTermCode,
  TERM_CODE_MESSAGE,
  updateDepartment,
} from "@/lib/catalog";

import styles from "./catalog-form.module.css";

type FormProps = {
  onSaved: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
};

const DEPARTMENT_FIELDS = ["code", "name", "is_active"] as const;
type DepartmentErrors = Partial<Record<(typeof DEPARTMENT_FIELDS)[number], string[]>>;

/** Creates a department or edits one, including deactivating it. */
export function DepartmentForm({
  department,
  onSaved,
  onBusyChange,
}: FormProps & { department?: Department }) {
  const [code, setCode] = useState(department?.code ?? "");
  const [name, setName] = useState(department?.name ?? "");
  const [active, setActive] = useState(department?.is_active ?? true);
  const [errors, setErrors] = useState<DepartmentErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const missing: DepartmentErrors = {};
    if (!code.trim()) missing.code = ["Ingresa el código."];
    if (!name.trim()) missing.name = ["Ingresa el nombre."];
    setErrors(missing);
    setFormError(null);
    if (Object.keys(missing).length > 0) return;

    const data = { code: code.trim().toUpperCase(), name: name.trim(), is_active: active };
    let changes: DepartmentChanges = data;
    if (department) {
      changes = {};
      if (data.code !== department.code) changes.code = data.code;
      if (data.name !== department.name) changes.name = data.name;
      if (data.is_active !== (department.is_active ?? true)) changes.is_active = data.is_active;
      if (Object.keys(changes).length === 0) {
        setFormError("No hay cambios por guardar.");
        return;
      }
    }

    setSubmitting(true);
    onBusyChange(true);
    try {
      if (department) {
        const saved = await updateDepartment(department.id, changes);
        onSaved(`Se guardaron los cambios de ${saved.code}.`);
      } else {
        const created = await createDepartment(data);
        onSaved(`Se creó el departamento ${created.code}.`);
      }
    } catch (error) {
      const { byField, message } = formErrors(error, DEPARTMENT_FIELDS);
      setErrors(byField);
      setFormError(message);
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField
        id="department-code"
        label="Código"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="MAT"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        errors={errors.code}
        variant="glass"
      />
      <TextField
        id="department-name"
        label="Nombre"
        autoComplete="off"
        value={name}
        onChange={(event) => setName(event.target.value)}
        errors={errors.name}
        variant="glass"
      />
      <label className={styles.toggle}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        Departamento activo
      </label>
      <Button type="submit" softDisabled={submitting} className={styles.submit}>
        {submitting ? "Guardando…" : department ? "Guardar cambios" : "Crear departamento"}
      </Button>
    </form>
  );
}

const TERM_FIELDS = ["code", "start_date", "end_date"] as const;
type TermErrors = Partial<Record<(typeof TERM_FIELDS)[number], string[]>>;

/** Registers an academic term. The code follows the API's AAAA-S rule, checked here too. */
export function TermForm({ onSaved, onBusyChange }: FormProps) {
  const [code, setCode] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [errors, setErrors] = useState<TermErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const trimmed = code.trim();
    const missing: TermErrors = {};
    if (!trimmed) missing.code = ["Ingresa el código."];
    else if (!isTermCode(trimmed)) missing.code = [TERM_CODE_MESSAGE];
    if (!start) missing.start_date = ["Elige la fecha de inicio."];
    if (!end) missing.end_date = ["Elige la fecha de fin."];
    // ISO dates compare correctly as text.
    else if (start && end <= start) {
      missing.end_date = ["La fecha de fin debe ser posterior al inicio."];
    }
    setErrors(missing);
    setFormError(null);
    if (Object.keys(missing).length > 0) return;

    setSubmitting(true);
    onBusyChange(true);
    try {
      const created = await createTerm({ code: trimmed, start_date: start, end_date: end });
      onSaved(`Se creó el período ${created.code}.`);
    } catch (error) {
      const { byField, message } = formErrors(error, TERM_FIELDS);
      setErrors(byField);
      setFormError(message);
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField
        id="term-code"
        label="Código"
        autoComplete="off"
        spellCheck={false}
        inputMode="numeric"
        placeholder="2027-1"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        errors={errors.code}
        variant="glass"
      />
      <p className={styles.hint}>Año y semestre: 1 para el primero, 2 para el segundo.</p>
      <div className={styles.pair}>
        <TextField
          id="term-start"
          label="Inicio"
          type="date"
          value={start}
          onChange={(event) => setStart(event.target.value)}
          errors={errors.start_date}
          variant="glass"
        />
        <TextField
          id="term-end"
          label="Fin"
          type="date"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
          errors={errors.end_date}
          variant="glass"
        />
      </div>
      <Button type="submit" softDisabled={submitting} className={styles.submit}>
        {submitting ? "Creando…" : "Crear período"}
      </Button>
    </form>
  );
}
