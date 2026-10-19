"use client";

import { type CSSProperties, useState } from "react";

import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { bogotaDateTime, isGroupSession, type Slot } from "@/lib/availability";

import {
  MODALITY_LABELS,
  sessionLabel,
  slotsCountLabel,
  slotTimeRange,
  STATUS_LABELS,
} from "../labels";
import { clockLabel, dayOfMonth, fullDayLabel, minutesOfDay, weekdayLabel } from "../week";
import styles from "./week-calendar.module.css";

/** The hours always on screen; a slot outside them stretches the grid to fit it. */
const FIRST_HOUR = 7;
const LAST_HOUR = 21;
const STEP = 30;

type WeekCalendarProps = {
  /** The seven Bogotá dates of the week, Monday first. */
  days: string[];
  /** Every slot of the monitor in the week, of any subject. */
  slots: Slot[];
  /** The assignment's subject: its slots open; the others only mark busy time. */
  subjectId: number;
  today: string;
  /** Minutes after midnight, Bogotá time: before this, today's hours are past. */
  nowMinutes: number;
  loading: boolean;
  onCreate: (date: string, time: string) => void;
  /** A slot of the assignment was chosen; `opener` gets focus back when its drawer closes. */
  onOpen: (slot: Slot, opener: HTMLElement) => void;
};

type Placed = { slot: Slot; start: number; end: number; own: boolean };

function place(slot: Slot, subjectId: number): Placed {
  const start = minutesOfDay(slot.starts_at);
  const length = (new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / 60_000;
  return { slot, start, end: start + length, own: slot.subject.id === subjectId };
}

/**
 * A week of the monitor's availability on an hour grid, Bogotá time: the assignment's slots
 * by state, the monitor's other subjects as busy time, and every free future half hour as a
 * place to publish a new slot. On phones it turns into one day at a time.
 * Presentational: the container reads the week and owns the drawers.
 */
export default function WeekCalendar({
  days,
  slots,
  subjectId,
  today,
  nowMinutes,
  loading,
  onCreate,
  onOpen,
}: WeekCalendarProps) {
  const [picked, setPicked] = useState<string | null>(null);
  // Withdrawn slots free their time again; they stay in the list view, not on the grid.
  const placed = slots
    .filter((slot) => slot.status !== "CANCELLED")
    .map((slot) => place(slot, subjectId));
  const byDay = new Map<string, Placed[]>(days.map((day) => [day, []]));
  for (const item of placed) byDay.get(bogotaDateTime(item.slot.starts_at).date)?.push(item);

  const first = Math.min(
    FIRST_HOUR * 60,
    ...placed.map((item) => Math.floor(item.start / 60) * 60),
  );
  const last = Math.max(LAST_HOUR * 60, ...placed.map((item) => Math.ceil(item.end / 60) * 60));
  const steps = Array.from({ length: (last - first) / STEP }, (_, index) => first + index * STEP);

  const isPast = (day: string, minutes: number) =>
    day < today || (day === today && minutes <= nowMinutes);
  const selected =
    picked && days.includes(picked) ? picked : days.includes(today) ? today : days[0]!;

  return (
    <div className={styles.calendar} data-loading={loading || undefined} aria-busy={loading}>
      {/* --- Desktop and tablet: the whole week on an hour grid --------------------------- */}
      <div
        className={styles.week}
        style={{ "--rows": steps.length } as CSSProperties}
        role="group"
        aria-label="Semana"
      >
        <div className={styles.corner} aria-hidden="true" />
        {days.map((day) => (
          <div
            key={day}
            className={styles.dayHead}
            data-today={day === today || undefined}
            data-past={day < today || undefined}
          >
            <span className={styles.weekday}>{weekdayLabel(day)}</span>
            <span className={styles.dayNumber}>{dayOfMonth(day)}</span>
          </div>
        ))}

        <div className={styles.gutter} aria-hidden="true">
          {steps
            .filter((minutes) => minutes % 60 === 0)
            .map((minutes) => (
              <span key={minutes} className={styles.hour}>
                {clockLabel(minutes)}
              </span>
            ))}
        </div>

        {days.map((day) => (
          <div
            key={day}
            className={styles.column}
            data-today={day === today || undefined}
            aria-label={fullDayLabel(day)}
            role="group"
          >
            {steps.map((minutes) => {
              const past = isPast(day, minutes);
              const time = clockLabel(minutes);
              return (
                <button
                  key={minutes}
                  type="button"
                  // The keyboard path to a new slot is the "Publicar franja" button.
                  tabIndex={-1}
                  className={styles.cell}
                  data-hour={minutes % 60 === 0 || undefined}
                  data-label={time}
                  disabled={past}
                  aria-label={`Publicar franja el ${fullDayLabel(day)} a las ${time}`}
                  onClick={() => onCreate(day, time)}
                />
              );
            })}

            {(byDay.get(day) ?? []).map((item) => (
              <SlotBlock key={item.slot.id} item={item} first={first} onOpen={onOpen} />
            ))}

            {day === today && nowMinutes >= first && nowMinutes <= last && (
              <span
                className={styles.now}
                style={{ "--at": (nowMinutes - first) / STEP } as CSSProperties}
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>

      {/* --- Phones: pick a day, then its slots ------------------------------------------- */}
      <div className={styles.agenda}>
        <div className={styles.strip} role="group" aria-label="Día">
          {days.map((day) => {
            const count = (byDay.get(day) ?? []).filter((item) => item.own).length;
            return (
              <button
                key={day}
                type="button"
                className={styles.stripDay}
                aria-pressed={day === selected}
                aria-label={`${fullDayLabel(day)}${count ? `, ${slotsCountLabel(count)}` : ""}`}
                data-today={day === today || undefined}
                onClick={() => setPicked(day)}
              >
                <span className={styles.weekday}>{weekdayLabel(day)}</span>
                <span className={styles.dayNumber}>{dayOfMonth(day)}</span>
                <span className={styles.dots} aria-hidden="true">
                  {count > 0 && <span className={styles.dot} />}
                </span>
              </button>
            );
          })}
        </div>

        <h3 className={styles.agendaTitle}>{fullDayLabel(selected)}</h3>
        {(byDay.get(selected) ?? []).length === 0 ? (
          <p className={styles.agendaEmpty}>Nada publicado este día.</p>
        ) : (
          <ul className={styles.agendaList}>
            {(byDay.get(selected) ?? []).map((item) => (
              <li key={item.slot.id}>
                <AgendaRow item={item} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        )}
        {selected >= today && (
          <Button
            variant="ghost"
            className={styles.agendaCreate}
            onClick={() => onCreate(selected, "")}
          >
            <Icon name="plus" />
            Publicar franja este día
          </Button>
        )}
      </div>
    </div>
  );
}

function SlotBlock({
  item,
  first,
  onOpen,
}: {
  item: Placed;
  first: number;
  onOpen: (slot: Slot, opener: HTMLElement) => void;
}) {
  const { slot, start, end, own } = item;
  const style = {
    "--from": (start - first) / STEP,
    "--span": (end - start) / STEP,
  } as CSSProperties;
  const range = slotTimeRange(slot.starts_at, slot.ends_at);

  if (!own) {
    return (
      <div
        className={styles.block}
        data-other
        style={style}
        title={`${slot.subject.code} · ${slot.subject.name}, ${range}`}
      >
        <span className={styles.blockTime}>{range}</span>
        <span className={styles.blockMeta}>{slot.subject.code}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={styles.block}
      data-status={slot.status}
      style={style}
      aria-label={`${range}, ${STATUS_LABELS[slot.status]}, ${MODALITY_LABELS[slot.modality]} en ${slot.location}`}
      onClick={(event) => onOpen(slot, event.currentTarget)}
    >
      <span className={styles.blockTime}>
        {range}
        {slot.template !== null && <Icon name="repeat" size={12} className={styles.repeat} />}
      </span>
      <span className={styles.blockMeta}>
        {isGroupSession(slot.capacity) ? `${slot.capacity} cupos · ` : ""}
        {slot.location}
      </span>
    </button>
  );
}

function AgendaRow({
  item,
  onOpen,
}: {
  item: Placed;
  onOpen: (slot: Slot, opener: HTMLElement) => void;
}) {
  const { slot, own } = item;
  const range = slotTimeRange(slot.starts_at, slot.ends_at);
  const body = (
    <>
      <span className={styles.rowTime}>{range}</span>
      <span className={styles.rowWhat}>
        {own ? (
          <>
            <span className={styles.rowStatus} data-status={slot.status}>
              {STATUS_LABELS[slot.status]}
            </span>
            <span className={styles.rowPlace}>
              {`${MODALITY_LABELS[slot.modality]} · ${slot.location} · ${sessionLabel(slot.capacity)}`}
            </span>
          </>
        ) : (
          <span
            className={styles.rowPlace}
          >{`Ocupado: ${slot.subject.code} · ${slot.subject.name}`}</span>
        )}
      </span>
    </>
  );
  return own ? (
    <button
      type="button"
      className={styles.row}
      data-status={slot.status}
      onClick={(event) => onOpen(slot, event.currentTarget)}
    >
      {body}
      <Icon name="chevron" size={16} className={styles.rowArrow} />
    </button>
  ) : (
    <div className={styles.row} data-other>
      {body}
    </div>
  );
}
