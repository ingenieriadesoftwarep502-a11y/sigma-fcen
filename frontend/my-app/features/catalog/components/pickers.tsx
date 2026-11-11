"use client";

import AsyncCombobox from "@/components/ui/combobox";
import { listSubjects, NO_SUBJECT_FILTERS } from "@/lib/catalog";
import { displayName } from "@/lib/people";
import { listUsers } from "@/lib/users";

/** How many matches a picker offers at once; typing more narrows them. */
const PICKER_SIZE = 10;

export type SubjectOption = { id: number; code: string; name: string };
export type PersonOption = { id: string; email: string; name: string };

type PickerProps<T> = {
  id: string;
  label: string;
  value: T | null;
  onChange: (value: T | null) => void;
  errors?: string[];
  disabled?: boolean;
};

async function searchSubjects(query: string, signal: AbortSignal): Promise<SubjectOption[]> {
  const page = await listSubjects(
    1,
    { ...NO_SUBJECT_FILTERS, search: query, active: true },
    signal,
    PICKER_SIZE,
  );
  return page.results.map(({ id, code, name }) => ({ id, code, name }));
}

/** Finds an active subject by code or name. */
export function SubjectPicker(props: PickerProps<SubjectOption>) {
  return (
    <AsyncCombobox<SubjectOption>
      {...props}
      placeholder="Busca por código o nombre"
      search={searchSubjects}
      optionKey={(subject) => String(subject.id)}
      optionLabel={(subject) => `${subject.code} · ${subject.name}`}
      renderOption={(subject) => (
        <>
          <span>{subject.name}</span>
          <small>{subject.code}</small>
        </>
      )}
      emptyMessage="Ninguna asignatura activa coincide."
    />
  );
}

function peopleWithRole(role: "TEACHER" | "MONITOR") {
  return async (query: string, signal: AbortSignal): Promise<PersonOption[]> => {
    const page = await listUsers(1, { search: query, role, isActive: true }, signal);
    return page.results.map((user) => ({ id: user.id, email: user.email, name: displayName(user) }));
  };
}

const searchTeachers = peopleWithRole("TEACHER");
const searchMonitors = peopleWithRole("MONITOR");

type PersonPickerProps = PickerProps<PersonOption> & { role: "TEACHER" | "MONITOR" };

/** Finds an active account holding the role, by name or email. */
export function PersonPicker({ role, ...props }: PersonPickerProps) {
  return (
    <AsyncCombobox<PersonOption>
      {...props}
      placeholder="Busca por nombre o correo"
      search={role === "TEACHER" ? searchTeachers : searchMonitors}
      optionKey={(person) => person.id}
      optionLabel={(person) => person.name}
      renderOption={(person) => (
        <>
          <span>{person.name}</span>
          <small>{person.email}</small>
        </>
      )}
      emptyMessage={
        role === "TEACHER"
          ? "Ningún docente activo coincide."
          : "Ningún monitor activo coincide. Revisa que la cuenta tenga el rol Monitor."
      }
    />
  );
}
