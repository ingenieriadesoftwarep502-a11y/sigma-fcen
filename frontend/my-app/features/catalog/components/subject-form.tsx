"use client";

import { type FormEvent, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import SelectField from "@/components/ui/select-field";
import TextField from "@/components/ui/text-field";
import { formErrors } from "@/lib/api-client";
import {
  createSubject,
  type Department,
  type Subject,
  type SubjectChanges,
  updateSubject,
} from "@/lib/catalog";

import styles from "./catalog-form.module.css";

const FIELDS = ["code", "name", "department", "credits", "is_active"] as const;
type Errors = Partial<Record<(typeof FIELDS)[number], string[]>>;

type SubjectFormProps = {
  /** The subject being edited; without it the form creates one. */
  subject?: Subject;
  departments: Department[] | null;
  onSaved: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
};

function wholeNumber(value: string): number | null {
  return /^\d+$/.test(value.trim()) && Number(value) > 0 ? Number(value) : null;
}

/** Creates a subject or edits one, including deactivating it (RF-022, T-02.7). */
export default function SubjectForm({ subject, departments, onSaved, onBusyChange }: SubjectFormProps) {
  const [code, setCode] = useState(subject?.code ?? "");
  const [name, setName] = useState(subject?.name ?? "");
  const [department, setDepartment] = useState(subject ? String(subject.department.id) : "");
  const [credits, setCredits] = useState(subject ? String(subject.credits) : "");
  const [active, setActive] = useState(subject?.is_active ?? true);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // New subjects go to active departments; an edit keeps showing its current one.
  const options = (departments ?? []).filter(
    (item) => item.is_active !== false || item.id === subject?.department.id,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const creditCount = wholeNumber(credits);
    const missing: Errors = {};
    if (!code.trim()) missing.code = ["Ingresa el código."];
    if (!name.trim()) missing.name = ["Ingresa el nombre."];
    if (!department) missing.department = ["Elige el departamento."];
    if (creditCount === null) missing.credits = ["Ingresa un número entero de créditos."];
    setErrors(missing);
    setFormError(null);
    if (Object.keys(missing).length > 0 || creditCount === null) return;

    const data = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      department: Number(department),
      credits: creditCount,
      is_active: active,
    };
    let changes: SubjectChanges = data;
    if (subject) {
      changes = {};
      if (data.code !== subject.code) changes.code = data.code;
      if (data.name !== subject.name) changes.name = data.name;
      if (data.department !== subject.department.id) changes.department = data.department;
      if (data.credits !== subject.credits) changes.credits = data.credits;
      if (data.is_active !== subject.is_active) changes.is_active = data.is_active;
      if (Object.keys(changes).length === 0) {
        setFormError("No hay cambios por guardar.");
        return;
      }
    }

    setSubmitting(true);
    onBusyChange(true);
    try {
      if (subject) {
        const saved = await updateSubject(subject.id, changes);
        onSaved(`Se guardaron los cambios de ${saved.code}.`);
      } else {
        const created = await createSubject(data);
        onSaved(`Se creó la asignatura ${created.code}.`);
      }
    } catch (error) {
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
      <div className={styles.pair}>
        <TextField
          id="subject-code"
          label="Código"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="MAT-101"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          errors={errors.code}
          variant="glass"
        />
        <TextField
          id="subject-credits"
          label="Créditos"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={credits}
          onChange={(event) => setCredits(event.target.value)}
          errors={errors.credits}
          variant="glass"
        />
      </div>
      <TextField
        id="subject-name"
        label="Nombre"
        autoComplete="off"
        value={name}
        onChange={(event) => setName(event.target.value)}
        errors={errors.name}
        variant="glass"
      />
      <SelectField
        id="subject-department"
        label="Departamento"
        variant="form"
        value={department}
        onChange={setDepartment}
        errors={errors.department}
        disabled={!departments}
      >
        <option value="">{departments ? "Elige un departamento" : "Cargando departamentos…"}</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.is_active === false ? `${item.name} (inactivo)` : item.name}
          </option>
        ))}
      </SelectField>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        Asignatura activa
      </label>
      {!active && (
        <p className={styles.hint}>
          Una asignatura inactiva no aparece a los estudiantes ni admite franjas nuevas.
        </p>
      )}
      <Button type="submit" softDisabled={submitting} className={styles.submit}>
        {submitting ? "Guardando…" : subject ? "Guardar cambios" : "Crear asignatura"}
      </Button>
    </form>
  );
}
