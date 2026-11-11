"use client";

import { useState } from "react";

import DataTable, { type Column } from "@/components/ui/data-table";
import EmptyState from "@/components/ui/empty-state";
import TextField from "@/components/ui/text-field";
import { slotTimeRange } from "@/features/availability/labels";
import { formatDate } from "@/lib/format";
import {
  dateRangeError,
  listCourseSessions,
  NO_SESSION_DATES,
  SESSIONS_PAGE_SIZE,
  type SessionDates,
  type SessionFilters,
  type TeachingSession,
} from "@/lib/teaching";
import { usePagedList } from "@/lib/use-paged-list";

import styles from "./teaching.module.css";

const COLUMNS: readonly Column[] = [
  { label: "Fecha", className: styles.colDate },
  { label: "Monitor", className: styles.colMonitor },
  { label: "Estudiantes" },
  { label: "Temas" },
];

function sameFilters(a: SessionFilters, b: SessionFilters): boolean {
  return a.course === b.course && a.dateFrom === b.dateFrom && a.dateTo === b.dateTo;
}

function SessionRow({ session }: { session: TeachingSession }) {
  return (
    <tr>
      <th scope="row">
        <span className={styles.cellPrimary}>{formatDate(session.starts_at)}</span>
        <span className={styles.cellSecondary}>
          {slotTimeRange(session.starts_at, session.ends_at)}
        </span>
      </th>
      <td>{session.monitor.full_name || "Sin nombre"}</td>
      <td>
        {session.students.length === 0
          ? "Nadie asistió"
          : session.students.map((student) => student.full_name || "Sin nombre").join(", ")}
      </td>
      <td>
        {session.topics.length === 0
          ? "Sin temas"
          : session.topics.map((topic) => topic.name).join(" · ")}
      </td>
    </tr>
  );
}

/**
 * The sessions of one course, latest first, filterable by local date and paginated
 * (T-08.12, CA-HU09-2). The course and the dates are sent to the server, which filters.
 * Container; remount it per course.
 */
export default function CourseSessions({ courseId }: { courseId: number }) {
  const list = usePagedList(
    listCourseSessions,
    { course: courseId, ...NO_SESSION_DATES },
    sameFilters,
  );
  const [dates, setDates] = useState<SessionDates>(NO_SESSION_DATES);
  const rangeError = dateRangeError(dates.dateFrom, dates.dateTo);

  function changeDates(next: SessionDates) {
    setDates(next);
    // An inverted range is explained here and never sent: the API would answer 400.
    if (!dateRangeError(next.dateFrom, next.dateTo)) {
      list.setFilters({ course: courseId, ...next });
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="course-sessions-title">
      <h2 id="course-sessions-title" className={styles.sectionTitle}>
        Sesiones realizadas
      </h2>
      <div className={styles.dates}>
        <TextField
          id="teaching-date-from"
          label="Desde"
          type="date"
          value={dates.dateFrom ?? ""}
          onChange={(event) => changeDates({ ...dates, dateFrom: event.target.value || null })}
        />
        <TextField
          id="teaching-date-to"
          label="Hasta"
          type="date"
          value={dates.dateTo ?? ""}
          errors={rangeError ? [rangeError] : []}
          onChange={(event) => changeDates({ ...dates, dateTo: event.target.value || null })}
        />
      </div>
      <DataTable<TeachingSession>
        label="Sesiones del curso"
        caption="Sesiones realizadas en el curso, de la más reciente a la más antigua"
        loadingLabel="Cargando sesiones…"
        paginationLabel="Páginas de sesiones"
        columns={COLUMNS}
        page={list.page}
        pageSize={SESSIONS_PAGE_SIZE}
        data={list.data}
        loading={list.loading}
        error={list.error}
        empty={
          <EmptyState
            title={
              list.filters.dateFrom || list.filters.dateTo
                ? "No hay sesiones en esas fechas."
                : "No hay sesiones registradas en este curso."
            }
          />
        }
        tableClassName={styles.table}
        renderRow={(session) => <SessionRow key={session.id} session={session} />}
        onPageChange={list.goTo}
        onRetry={list.reload}
      />
    </section>
  );
}
