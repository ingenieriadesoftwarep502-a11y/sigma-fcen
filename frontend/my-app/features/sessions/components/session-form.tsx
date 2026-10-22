"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import TextField from "@/components/ui/text-field";
import ToggleChip from "@/components/ui/toggle-chip";
import { slotDayLabel, slotTimeRange } from "@/features/availability/labels";
import { formErrors, requestErrorMessage } from "@/lib/api-client";
import { listMaterials, type Material } from "@/lib/materials";
import {
  addTopic,
  type AttendanceStatus,
  listTopics,
  MAX_DURATION_MINUTES,
  MAX_NOTES_LENGTH,
  MAX_TOPIC_NAME_LENGTH,
  type PendingSlot,
  recordSession,
  type SessionSlot,
  type Topic,
  type TutoringSession,
  updateSession,
} from "@/lib/sessions";

import { ATTENDANCE_LABELS, TOPIC_REQUIRED_MESSAGE } from "../labels";
import styles from "./sessions.module.css";

const FIELDS = ["attendance", "topic_ids", "material_ids", "notes", "duration_minutes"] as const;
type Field = (typeof FIELDS)[number];
type Errors = Partial<Record<Field, string[]>>;

const DURATION_MESSAGE = `La duración debe estar entre 1 y ${MAX_DURATION_MINUTES} minutos.`;
const ATTENDANCE_CHOICES: readonly AttendanceStatus[] = ["ATTENDED", "NO_SHOW"];

export type SessionFormMode =
  | { kind: "record"; pending: PendingSlot }
  | { kind: "edit"; session: TutoringSession };

type SessionFormProps = {
  mode: SessionFormMode;
  onSaved: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
};

function slotOf(mode: SessionFormMode): SessionSlot {
  return mode.kind === "record" ? mode.pending.slot : mode.session.slot;
}

function slotMinutes(slot: SessionSlot): number {
  return Math.round((new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / 60_000);
}

/** Adds or removes `id`, keeping the order in which the person picked them. */
function toggled(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id];
}

/** The subject's topics and material, loaded once for the form. */
function useSubjectCatalog(subjectId: number) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      listTopics(subjectId, signal),
      listMaterials(subjectId, "DOCUMENT", 1, signal),
      listMaterials(subjectId, "VIDEO", 1, signal),
    ]).then(
      ([loadedTopics, documents, videos]) => {
        if (signal.aborted) return;
        setTopics(loadedTopics);
        setMaterials([...documents.results, ...videos.results]);
      },
      (failure: unknown) => {
        if (!signal.aborted) setError(requestErrorMessage(failure));
      },
    );
    return () => controller.abort();
  }, [subjectId]);

  return { topics, setTopics, materials, error };
}

/**
 * Records the session of a slot that already started, or corrects one within 48 hours
 * (T-05.16, RF-052). Recording marks every reservation of the slot; attendance is final
 * afterwards, so editing shows it without letting it change (RN-006.8).
 */
export default function SessionForm({ mode, onSaved, onBusyChange }: SessionFormProps) {
  const slot = slotOf(mode);
  const editing = mode.kind === "edit" ? mode.session : null;
  const catalog = useSubjectCatalog(slot.subject.id);

  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(() =>
    mode.kind === "record"
      ? Object.fromEntries(mode.pending.reservations.map((r) => [r.id, "ATTENDED" as const]))
      : {},
  );
  const [topicIds, setTopicIds] = useState<string[]>(
    () => editing?.topics.map((topic) => topic.id) ?? [],
  );
  const [materialIds, setMaterialIds] = useState<string[]>(
    () => editing?.materials.map((material) => material.id) ?? [],
  );
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [duration, setDuration] = useState(editing ? String(editing.duration_minutes) : "");
  const [newTopic, setNewTopic] = useState("");
  const [topicProblem, setTopicProblem] = useState<string | null>(null);
  const [addingTopic, setAddingTopic] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const someoneAttended =
    mode.kind === "record"
      ? Object.values(marks).includes("ATTENDED")
      : mode.session.attendance.some((row) => row.attendance === "ATTENDED");

  async function createTopic() {
    const name = newTopic.trim();
    if (!name || addingTopic) return;
    setAddingTopic(true);
    setTopicProblem(null);
    try {
      const topic = await addTopic(slot.subject.id, name);
      catalog.setTopics((current) =>
        current?.some((known) => known.id === topic.id) ? current : [...(current ?? []), topic],
      );
      setTopicIds((current) => (current.includes(topic.id) ? current : [...current, topic.id]));
      setNewTopic("");
      setErrors((current) => ({ ...current, topic_ids: undefined }));
    } catch (error) {
      const { byField, message } = formErrors(error, ["name"] as const);
      setTopicProblem(byField.name?.join(" ") ?? message);
    } finally {
      setAddingTopic(false);
    }
  }

  function handleNewTopicKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    // Enter adds the topic instead of sending the whole form.
    event.preventDefault();
    void createTopic();
  }

  function localErrors(): Errors {
    const found: Errors = {};
    if (someoneAttended && topicIds.length === 0) found.topic_ids = [TOPIC_REQUIRED_MESSAGE];
    if (duration.trim()) {
      const minutes = Number(duration);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_DURATION_MINUTES) {
        found.duration_minutes = [DURATION_MESSAGE];
      }
    } else if (editing) {
      found.duration_minutes = [DURATION_MESSAGE];
    }
    return found;
  }

  async function save(): Promise<string> {
    if (mode.kind === "record") {
      await recordSession({
        slot_id: slot.id,
        attendance: mode.pending.reservations.map((reservation) => ({
          reservation_id: reservation.id,
          attendance: marks[reservation.id] ?? "ATTENDED",
        })),
        topic_ids: topicIds,
        material_ids: materialIds,
        notes,
        ...(duration.trim() ? { duration_minutes: Number(duration) } : {}),
      });
      return `Registraste la sesión de ${slot.subject.name} del ${slotDayLabel(slot.starts_at)}.`;
    }
    await updateSession(mode.session.id, {
      topic_ids: topicIds,
      material_ids: materialIds,
      notes,
      duration_minutes: Number(duration),
    });
    return `Guardaste los cambios de la sesión de ${slot.subject.name}.`;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = localErrors();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    onBusyChange(true);
    try {
      onSaved(await save());
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
      {catalog.error && <Alert tone="error">{catalog.error}</Alert>}

      <p className={styles.formSlot}>
        {`${slotDayLabel(slot.starts_at)} · ${slotTimeRange(slot.starts_at, slot.ends_at)}`}
      </p>

      {mode.kind === "record" ? (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Asistencia</legend>
          <ul className={styles.attendance}>
            {mode.pending.reservations.map((reservation) => {
              const name = reservation.student.full_name || "Estudiante sin nombre";
              return (
                <li key={reservation.id}>
                  <div role="group" aria-label={name} className={styles.attendanceRow}>
                    <span className={styles.studentName}>{name}</span>
                    <span className={styles.choices}>
                      {ATTENDANCE_CHOICES.map((choice) => (
                        <ToggleChip
                          key={choice}
                          pressed={marks[reservation.id] === choice}
                          onClick={() =>
                            setMarks((current) => ({ ...current, [reservation.id]: choice }))
                          }
                        >
                          {ATTENDANCE_LABELS[choice]}
                        </ToggleChip>
                      ))}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <FieldErrors messages={errors.attendance} />
        </fieldset>
      ) : (
        <div className={styles.fixedAttendance}>
          <p className={styles.legend}>Asistencia</p>
          <ul>
            {mode.session.attendance.map((row) => (
              <li key={row.reservation_id}>
                {`${row.student.full_name || "Estudiante sin nombre"}: ${ATTENDANCE_LABELS[row.attendance].toLowerCase()}`}
              </li>
            ))}
          </ul>
          <p className={styles.hint}>La asistencia no se puede cambiar después de registrarla.</p>
        </div>
      )}

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Temas trabajados</legend>
        {catalog.topics === null && !catalog.error && (
          <p className={styles.hint}>Cargando los temas de la asignatura…</p>
        )}
        {catalog.topics && catalog.topics.length === 0 && (
          <p className={styles.hint}>La asignatura aún no tiene temas. Agrega el primero.</p>
        )}
        {catalog.topics && catalog.topics.length > 0 && (
          <div className={styles.chips}>
            {catalog.topics.map((topic) => (
              <ToggleChip
                key={topic.id}
                pressed={topicIds.includes(topic.id)}
                onClick={() => setTopicIds((current) => toggled(current, topic.id))}
              >
                {topic.name}
              </ToggleChip>
            ))}
          </div>
        )}
        <div className={styles.newTopic}>
          <TextField
            id="new-topic"
            label="Nuevo tema"
            autoComplete="off"
            maxLength={MAX_TOPIC_NAME_LENGTH}
            value={newTopic}
            onChange={(event) => setNewTopic(event.target.value)}
            onKeyDown={handleNewTopicKey}
            errors={topicProblem ? [topicProblem] : []}
            variant="glass"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            softDisabled={addingTopic || !newTopic.trim()}
            onClick={() => void createTopic()}
          >
            Agregar tema
          </Button>
        </div>
        <FieldErrors messages={errors.topic_ids} />
      </fieldset>

      {catalog.materials && catalog.materials.length > 0 && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Material usado (opcional)</legend>
          <div className={styles.chips}>
            {catalog.materials.map((material) => (
              <ToggleChip
                key={material.id}
                pressed={materialIds.includes(material.id)}
                onClick={() => setMaterialIds((current) => toggled(current, material.id))}
              >
                {material.title}
              </ToggleChip>
            ))}
          </div>
          <FieldErrors messages={errors.material_ids} />
        </fieldset>
      )}

      <div className={styles.textArea}>
        <label htmlFor="session-notes" className={styles.legend}>
          Observaciones (opcional)
        </label>
        <textarea
          id="session-notes"
          rows={4}
          maxLength={MAX_NOTES_LENGTH}
          className={styles.notes}
          value={notes}
          aria-describedby="session-notes-hint"
          onChange={(event) => setNotes(event.target.value)}
        />
        <p id="session-notes-hint" className={styles.hint}>
          Solo las ven tú, el docente del curso y la administración; los estudiantes no.
        </p>
        <FieldErrors messages={errors.notes} />
      </div>

      <TextField
        id="session-duration"
        label="Duración en minutos"
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_DURATION_MINUTES}
        placeholder={String(slotMinutes(slot))}
        value={duration}
        onChange={(event) => setDuration(event.target.value)}
        errors={errors.duration_minutes}
        variant="glass"
      />

      <Button type="submit" softDisabled={submitting} className={styles.submit}>
        {submitting
          ? "Guardando…"
          : mode.kind === "record"
            ? "Registrar sesión"
            : "Guardar cambios"}
      </Button>
    </form>
  );
}

function FieldErrors({ messages }: { messages: string[] | undefined }) {
  if (!messages || messages.length === 0) return null;
  return (
    <ul className={styles.errors}>
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}
