"use client";

import { type FormEvent, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import TextField from "@/components/ui/text-field";
import { formErrors } from "@/lib/api-client";
import {
  type Course,
  type CourseChanges,
  createCourse,
  type Term,
  updateCourse,
} from "@/lib/catalog";

import styles from "./catalog-form.module.css";
import { type PersonOption, PersonPicker, type SubjectOption, SubjectPicker } from "./pickers";
import TermSelect from "./term-select";

const FIELDS = ["subject", "term", "group", "teacher"] as const;
type Errors = Partial<Record<(typeof FIELDS)[number], string[]>>;

const TEACHER_LABEL = "Docente (opcional)";

function courseName(code: string, group: string): string {
  return `${code} grupo ${group}`;
}

type CourseCreateFormProps = {
  /** The term the list shows; the new course goes there unless another is chosen. */
  term: string | null;
  terms: Term[] | null;
  current: Term | null;
  onSaved: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
};

/** Opens a group of a subject in a term, optionally with its teacher (RF-024). */
export function CourseCreateForm({
  term: initialTerm,
  terms,
  current,
  onSaved,
  onBusyChange,
}: CourseCreateFormProps) {
  const [subject, setSubject] = useState<SubjectOption | null>(null);
  const [term, setTerm] = useState<string | null>(initialTerm);
  const [group, setGroup] = useState("");
  const [teacher, setTeacher] = useState<PersonOption | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const termCode = term ?? current?.code ?? null;
    const missing: Errors = {};
    if (!subject) missing.subject = ["Elige una asignatura de la lista."];
    if (!termCode) missing.term = ["Elige el período."];
    if (!group.trim()) missing.group = ["Ingresa el grupo."];
    setErrors(missing);
    setFormError(null);
    if (!subject || !termCode || Object.keys(missing).length > 0) return;

    setSubmitting(true);
    onBusyChange(true);
    try {
      const created = await createCourse({
        subject: subject.id,
        term: termCode,
        group: group.trim().toUpperCase(),
        teacher: teacher?.id ?? null,
      });
      onSaved(`Se creó el curso ${courseName(created.subject.code, created.group)}.`);
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
      <SubjectPicker
        id="course-subject"
        label="Asignatura"
        value={subject}
        onChange={setSubject}
        errors={errors.subject}
      />
      <div className={styles.pair}>
        <TermSelect
          id="course-term"
          variant="form"
          value={term}
          terms={terms}
          current={current}
          onChange={setTerm}
          errors={errors.term}
        />
        <TextField
          id="course-group"
          label="Grupo"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="1"
          value={group}
          onChange={(event) => setGroup(event.target.value)}
          errors={errors.group}
          variant="glass"
        />
      </div>
      <PersonPicker
        id="course-teacher"
        role="TEACHER"
        label={TEACHER_LABEL}
        value={teacher}
        onChange={setTeacher}
        errors={errors.teacher}
      />
      <Button type="submit" softDisabled={submitting} className={styles.submit}>
        {submitting ? "Creando…" : "Crear curso"}
      </Button>
    </form>
  );
}

type CourseEditFormProps = {
  course: Course;
  onSaved: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
};

/** Changes the group or the teacher of a course; its subject and term are fixed. */
export function CourseEditForm({ course, onSaved, onBusyChange }: CourseEditFormProps) {
  const [group, setGroup] = useState(course.group);
  const [teacher, setTeacher] = useState<PersonOption | null>(
    course.teacher
      ? { id: course.teacher.id, email: course.teacher.email, name: course.teacher.full_name }
      : null,
  );
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const missing: Errors = {};
    if (!group.trim()) missing.group = ["Ingresa el grupo."];
    setErrors(missing);
    setFormError(null);
    if (Object.keys(missing).length > 0) return;

    const changes: CourseChanges = {};
    const nextGroup = group.trim().toUpperCase();
    if (nextGroup !== course.group) changes.group = nextGroup;
    if ((teacher?.id ?? null) !== (course.teacher?.id ?? null)) changes.teacher = teacher?.id ?? null;
    if (Object.keys(changes).length === 0) {
      setFormError("No hay cambios por guardar.");
      return;
    }

    setSubmitting(true);
    onBusyChange(true);
    try {
      const saved = await updateCourse(course.id, changes);
      onSaved(`Se guardaron los cambios del curso ${courseName(saved.subject.code, saved.group)}.`);
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
      <dl className={styles.fixed}>
        <dt>Asignatura</dt>
        <dd>{`${course.subject.code} · ${course.subject.name}`}</dd>
        <dt>Período</dt>
        <dd>{course.term}</dd>
      </dl>
      <TextField
        id="course-group"
        label="Grupo"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        value={group}
        onChange={(event) => setGroup(event.target.value)}
        errors={errors.group}
        variant="glass"
      />
      <PersonPicker
        id="course-teacher"
        role="TEACHER"
        label={TEACHER_LABEL}
        value={teacher}
        onChange={setTeacher}
        errors={errors.teacher}
      />
      <Button type="submit" softDisabled={submitting} className={styles.submit}>
        {submitting ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
