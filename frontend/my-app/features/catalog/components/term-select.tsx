import SelectField from "@/components/ui/select-field";
import type { Term } from "@/lib/catalog";

type TermSelectProps = {
  id: string;
  /** The chosen term code; null follows the current term. */
  value: string | null;
  terms: Term[] | null;
  current: Term | null;
  onChange: (code: string | null) => void;
  variant?: "toolbar" | "form";
  className?: string;
  errors?: string[];
};

/**
 * Which academic term a view shows, newest first, with the current one marked. Choosing
 * the current term stores null, so the view keeps following it. Presentational.
 */
export default function TermSelect({
  id,
  value,
  terms,
  current,
  onChange,
  variant = "toolbar",
  className,
  errors,
}: TermSelectProps) {
  const selected = value ?? current?.code ?? "";
  const unavailable = !terms || terms.length === 0;

  return (
    <SelectField
      id={id}
      label="Período"
      variant={variant}
      className={className}
      errors={errors}
      value={unavailable ? "" : selected}
      disabled={unavailable}
      onChange={(code) => onChange(code === current?.code ? null : code || null)}
    >
      {!terms && <option value="">Cargando períodos…</option>}
      {terms?.length === 0 && <option value="">Sin períodos registrados</option>}
      {terms && terms.length > 0 && !selected && <option value="">Elige un período</option>}
      {terms?.map((term) => (
        <option key={term.id} value={term.code}>
          {term.id === current?.id ? `${term.code} (actual)` : term.code}
        </option>
      ))}
    </SelectField>
  );
}
