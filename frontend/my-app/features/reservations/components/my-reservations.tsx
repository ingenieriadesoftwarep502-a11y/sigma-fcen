"use client";

import { useState } from "react";

import Alert from "@/components/ui/alert";
import Button, { ButtonLink } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/ui/page-header";
import TabList, { panelId, tabId } from "@/components/ui/tabs";
import ToggleChip from "@/components/ui/toggle-chip";
import { useSession } from "@/features/auth/session/session-provider";
import { slotDayLabel, slotTimeRange } from "@/features/availability/labels";
import { requestErrorMessage } from "@/lib/api-client";
import { hasAnyRole, SUBJECTS_PATH } from "@/lib/auth";
import {
  CANCEL_WINDOW_HOURS,
  cancelReservation,
  isReservationConflict,
  listMyReservations,
  type Reservation,
  type ReservationFilters,
  type ReservationRole,
} from "@/lib/reservations";
import { usePagedList } from "@/lib/use-paged-list";

import { REASON_REQUIRED_MESSAGE } from "../labels";
import styles from "./my-reservations.module.css";
import ReservationCard, { type CancelStep } from "./reservation-card";

type When = "upcoming" | "past";

const TABS_ID = "reservations";

/** Each side of a reservation, in the order the page shows them (traceability, ADR-008). */
const SECTIONS: readonly {
  key: ReservationRole;
  label: string;
  listLabel: string;
  empty: { upcoming: string; past: string };
}[] = [
  {
    key: "monitor",
    label: "Reservas a mis monitorías",
    listLabel: "Reservas en tus franjas",
    empty: {
      upcoming: "Nadie ha reservado tus próximas franjas.",
      past: "Aún no hay historial de reservas en tus franjas.",
    },
  },
  {
    key: "student",
    label: "Mis reservas como estudiante",
    listLabel: "Tus reservas",
    empty: { upcoming: "No tienes reservas próximas.", past: "Aún no tienes historial." },
  },
];

function sameFilters(a: ReservationFilters, b: ReservationFilters): boolean {
  return a.role === b.role && a.when === b.when && a.status === b.status;
}

/** What the person reads once the cancellation went through. */
function cancelledNotice(cancelled: Reservation, role: ReservationRole): string {
  const { slot } = cancelled;
  const when = `${slotDayLabel(slot.starts_at)}, ${slotTimeRange(slot.starts_at, slot.ends_at)}`;
  if (role === "monitor") {
    return `Cancelaste la reserva de ${cancelled.student.full_name || "el estudiante"} en ${slot.subject.name} del ${when}.`;
  }
  const base = `Cancelaste la reserva de ${slot.subject.name} del ${when}.`;
  return cancelled.status === "NO_SHOW"
    ? `${base} Por la hora, quedó registrada como inasistencia; el cupo se liberó.`
    : `${base} El cupo quedó libre.`;
}

/**
 * The signed-in person's reservations (RF-045, RF-046, T-04.20), kept apart by side: the
 * reservations on their slots (MONITOR) and the ones they booked (STUDENT). Someone with both
 * roles switches between the two with tabs; someone with one role sees only their section.
 * Container: picks the sections the person's roles allow.
 */
export default function MyReservations() {
  const { session } = useSession();
  const [selected, setSelected] = useState<ReservationRole | null>(null);
  if (session.status !== "authenticated") return null;

  const sections = SECTIONS.filter((section) =>
    hasAnyRole(session.user, [section.key === "monitor" ? "MONITOR" : "STUDENT"]),
  );
  const current = sections.find((section) => section.key === selected) ?? sections[0];

  return (
    <section className={styles.page} aria-labelledby="reservations-title">
      <PageHeader
        title="Mis reservas"
        titleId="reservations-title"
        lead={`Lo que reservaste y lo que reservaron en tus franjas. Un estudiante puede cancelar sin consecuencias hasta ${CANCEL_WINDOW_HOURS} horas antes del inicio.`}
      />

      {current && sections.length > 1 && (
        <>
          <TabList
            label="Tipo de reservas"
            idPrefix={TABS_ID}
            tabs={sections}
            selected={current.key}
            onSelect={setSelected}
          />
          <div
            id={panelId(TABS_ID, current.key)}
            role="tabpanel"
            aria-labelledby={tabId(TABS_ID, current.key)}
            className={styles.panel}
          >
            <ReservationsSection key={current.key} section={current} />
          </div>
        </>
      )}

      {current && sections.length === 1 && (
        <section className={styles.panel} aria-labelledby={`${TABS_ID}-${current.key}-title`}>
          <h2 id={`${TABS_ID}-${current.key}-title`} className={styles.sectionTitle}>
            {current.label}
          </h2>
          <ReservationsSection section={current} />
        </section>
      )}
    </section>
  );
}

/**
 * One side's reservations, upcoming first or the history. Each upcoming one can be cancelled
 * after a confirmation; on the monitor's side it must be justified (ADR-011).
 * Container: owns the list, the filter and the cancellation.
 */
function ReservationsSection({ section }: { section: (typeof SECTIONS)[number] }) {
  const role = section.key;
  const list = usePagedList(
    listMyReservations,
    { role, when: "upcoming", status: null },
    sameFilters,
  );
  const [cancelling, setCancelling] = useState<{ id: string; step: CancelStep } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const when: When = list.filters.when === "past" ? "past" : "upcoming";

  function choose(next: When) {
    if (list.setFilters({ role, when: next, status: null })) {
      setCancelling(null);
      setNotice(null);
      setFailure(null);
    }
  }

  function ask(reservation: Reservation) {
    setNotice(null);
    setFailure(null);
    setCancelling({ id: reservation.id, step: { reason: "", reasonError: null, working: false } });
  }

  function update(step: Partial<CancelStep>) {
    setCancelling((current) => current && { ...current, step: { ...current.step, ...step } });
  }

  async function confirm(reservation: Reservation, step: CancelStep) {
    const reason = step.reason.trim();
    if (role === "monitor" && !reason) {
      update({ reasonError: REASON_REQUIRED_MESSAGE });
      return;
    }
    update({ working: true, reasonError: null });
    try {
      const cancelled = await cancelReservation(
        reservation.id,
        role === "monitor" ? reason : undefined,
      );
      setCancelling(null);
      setNotice(cancelledNotice(cancelled, role));
      list.reload();
    } catch (error) {
      if (isReservationConflict(error)) {
        // It changed meanwhile, e.g. already cancelled elsewhere: show the current state.
        setCancelling(null);
        setFailure(requestErrorMessage(error));
        list.reload();
        return;
      }
      update({ working: false });
      setFailure(requestErrorMessage(error));
    }
  }

  const reservations = list.data?.results ?? [];
  const firstLoad = list.data === null && list.error === null;

  return (
    <>
      <div className={styles.toolbar} role="group" aria-label="Qué reservas ver">
        <ToggleChip pressed={when === "upcoming"} onClick={() => choose("upcoming")}>
          Próximas
        </ToggleChip>
        <ToggleChip pressed={when === "past"} onClick={() => choose("past")}>
          Historial
        </ToggleChip>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {failure && <Alert tone="error">{failure}</Alert>}

      {list.error && (
        <div className={styles.failure}>
          <Alert tone="error">{list.error}</Alert>
          <Button variant="ghost" size="sm" onClick={list.reload}>
            <Icon name="refresh" />
            Intentar de nuevo
          </Button>
        </div>
      )}

      {firstLoad && <div className={styles.skeleton} aria-hidden="true" />}

      {list.data && reservations.length === 0 && !list.error && (
        <div className={styles.empty}>
          <EmptyState
            title={section.empty[when]}
            action={
              role === "student" && when === "upcoming" ? (
                <ButtonLink href={SUBJECTS_PATH} variant="ghost" size="sm">
                  Buscar monitorías
                </ButtonLink>
              ) : undefined
            }
          >
            {role === "student" && when === "upcoming" && (
              <p>Elige una asignatura y reserva una franja de sus monitores.</p>
            )}
          </EmptyState>
        </div>
      )}

      {reservations.length > 0 && (
        <ul className={styles.list} aria-label={section.listLabel} aria-busy={list.loading}>
          {reservations.map((reservation) => {
            const step = cancelling?.id === reservation.id ? cancelling.step : null;
            return (
              <li key={reservation.id}>
                <ReservationCard
                  reservation={reservation}
                  viewer={role}
                  cancelling={step}
                  onAsk={() => ask(reservation)}
                  onBack={() => setCancelling(null)}
                  onReasonChange={(reason) => update({ reason, reasonError: null })}
                  onConfirm={() => step && confirm(reservation, step)}
                />
              </li>
            );
          })}
        </ul>
      )}

      {list.data && (list.data.previous || list.data.next) && (
        <nav className={styles.pager} aria-label="Páginas de reservas">
          <Button
            variant="ghost"
            size="sm"
            softDisabled={!list.data.previous || list.loading}
            onClick={() => list.goTo(list.page - 1)}
          >
            Anterior
          </Button>
          <span className={styles.pageNumber}>{`Página ${list.page}`}</span>
          <Button
            variant="ghost"
            size="sm"
            softDisabled={!list.data.next || list.loading}
            onClick={() => list.goTo(list.page + 1)}
          >
            Siguiente
          </Button>
        </nav>
      )}
    </>
  );
}
