import SelectField from "@/components/ui/select-field";
import TextField from "@/components/ui/text-field";
import { MAX_LOCATION_LENGTH, MAX_SLOT_CAPACITY, type Modality } from "@/lib/availability";

import { locationLabel, MODALITY_LABELS } from "../labels";
import styles from "./availability.module.css";

export type SessionValues = {
  modality: Modality;
  location: string;
  /** Group session: more than one seat. */
  group: boolean;
  /** Seats as typed; only read for a group session. */
  capacity: string;
};

export type SessionErrors = Partial<Record<"modality" | "location" | "capacity", string[]>>;

export const GROUP_CAPACITY_MESSAGE = `Una sesión grupal necesita entre 2 y ${MAX_SLOT_CAPACITY} cupos.`;
const LOCATION_MESSAGE = "Indica el aula o el enlace de la sesión.";

/** Seats the API receives: 1 for an individual session, or the typed number, or null if invalid. */
export function capacityOf(values: SessionValues): number | null {
  if (!values.group) return 1;
  const text = values.capacity.trim();
  if (!/^\d+$/.test(text)) return null;
  const seats = Number(text);
  return seats >= 2 && seats <= MAX_SLOT_CAPACITY ? seats : null;
}

/** Client-side checks that mirror the API, so obvious mistakes never leave the browser. */
export function sessionErrors(values: SessionValues): SessionErrors {
  const errors: SessionErrors = {};
  if (!values.location.trim()) errors.location = [LOCATION_MESSAGE];
  if (capacityOf(values) === null) errors.capacity = [GROUP_CAPACITY_MESSAGE];
  return errors;
}

type SessionFieldsProps = {
  idPrefix: string;
  values: SessionValues;
  onChange: (values: SessionValues) => void;
  errors: SessionErrors;
};

/**
 * Where the session happens and who fits in it: modality, classroom or link, and whether it
 * is individual or a group session with its seats (ADR-010, 2026-10-15 extension).
 * Presentational.
 */
export default function SessionFields({ idPrefix, values, onChange, errors }: SessionFieldsProps) {
  const capacityErrors = errors.capacity ?? [];

  return (
    <>
      <div className={styles.pair}>
        <SelectField
          id={`${idPrefix}-modality`}
          label="Modalidad"
          variant="form"
          value={values.modality}
          errors={errors.modality}
          onChange={(modality) => onChange({ ...values, modality: modality as Modality })}
        >
          {(Object.keys(MODALITY_LABELS) as Modality[]).map((modality) => (
            <option key={modality} value={modality}>
              {MODALITY_LABELS[modality]}
            </option>
          ))}
        </SelectField>
        <TextField
          id={`${idPrefix}-location`}
          label={locationLabel(values.modality)}
          type={values.modality === "VIRTUAL" ? "url" : "text"}
          maxLength={MAX_LOCATION_LENGTH}
          placeholder={values.modality === "VIRTUAL" ? "https://…" : "Por ejemplo, Bloque 14-203"}
          value={values.location}
          onChange={(event) => onChange({ ...values, location: event.target.value })}
          errors={errors.location}
          variant="glass"
        />
      </div>

      <fieldset className={styles.choice}>
        <legend className={styles.legend}>Tipo de sesión</legend>
        <div className={styles.options}>
          <label className={styles.option}>
            <input
              type="radio"
              name={`${idPrefix}-session`}
              checked={!values.group}
              onChange={() => onChange({ ...values, group: false })}
              className={styles.radio}
            />
            Individual
          </label>
          <label className={styles.option}>
            <input
              type="radio"
              name={`${idPrefix}-session`}
              checked={values.group}
              onChange={() => onChange({ ...values, group: true })}
              className={styles.radio}
            />
            Grupal
          </label>
        </div>
      </fieldset>

      {values.group ? (
        <TextField
          id={`${idPrefix}-capacity`}
          label="Cupos"
          type="number"
          inputMode="numeric"
          min={2}
          max={MAX_SLOT_CAPACITY}
          step={1}
          value={values.capacity}
          onChange={(event) => onChange({ ...values, capacity: event.target.value })}
          errors={capacityErrors}
          variant="glass"
        />
      ) : (
        capacityErrors.length > 0 && (
          // The API may still refuse the seats of an individual session; never drop its message.
          <ul className={styles.errors}>
            {capacityErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )
      )}
      <p className={styles.hint}>
        {values.group
          ? "Varios estudiantes comparten la sesión hasta llenar los cupos."
          : "Un solo estudiante puede reservar esta sesión."}
      </p>
    </>
  );
}
