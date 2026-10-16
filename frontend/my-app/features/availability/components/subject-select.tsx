import SelectField from "@/components/ui/select-field";
import type { MonitorOwnAssignment } from "@/lib/catalog";

type SubjectSelectProps = {
  id: string;
  /** Subject id as text; "" when none is chosen. */
  value: string;
  /** The monitor's assignments of the term; null while they load. */
  assignments: MonitorOwnAssignment[] | null;
  onChange: (value: string) => void;
  errors?: string[];
};

/**
 * The subjects the monitor is assigned to in the term: the only ones they may publish on
 * (RN-003.5). Presentational.
 */
export default function SubjectSelect({
  id,
  value,
  assignments,
  onChange,
  errors,
}: SubjectSelectProps) {
  return (
    <SelectField
      id={id}
      label="Asignatura"
      variant="form"
      value={value}
      errors={errors}
      disabled={!assignments || assignments.length === 0}
      onChange={onChange}
    >
      {!assignments && <option value="">Cargando asignaturas…</option>}
      {assignments?.length === 0 && <option value="">Sin asignaturas asignadas</option>}
      {assignments && assignments.length > 0 && <option value="">Elige una asignatura</option>}
      {assignments?.map(({ subject }) => (
        <option key={subject.id} value={subject.id}>
          {`${subject.code} · ${subject.name}`}
        </option>
      ))}
    </SelectField>
  );
}
