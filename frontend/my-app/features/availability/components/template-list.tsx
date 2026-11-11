"use client";

import { useEffect, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { requestErrorMessage } from "@/lib/api-client";
import { deactivateTemplate, listMyTemplates, type SlotTemplate } from "@/lib/availability";
import type { MonitorOwnAssignment } from "@/lib/catalog";

import {
  MODALITY_LABELS,
  sessionLabel,
  slotsCountLabel,
  templateTimeRange,
  WEEKDAY_LABELS,
} from "../labels";
import styles from "./template-list.module.css";

type TemplateListProps = {
  assignment: MonitorOwnAssignment;
  /** Changes whenever the availability changed elsewhere, so the list is read again. */
  version: number;
  /** Opens the "Nueva plantilla" drawer; the button that asked is the event's target. */
  onCreate: (event: { currentTarget: HTMLElement }) => void;
  onChanged: (message: string) => void;
};

function describe(template: SlotTemplate): string {
  const weekday = WEEKDAY_LABELS[template.weekday]?.toLowerCase() ?? "";
  return `${weekday} ${template.start_time.slice(0, 5)}`;
}

type Loaded =
  | { status: "loading" }
  | { status: "ready"; key: string; templates: SlotTemplate[] }
  | { status: "error"; key: string; message: string };

/**
 * The assignment's weekly templates, active first: each publishes the same slot every week
 * until the end of the term. Deactivating one withdraws its future slots that hold no
 * reservation (T-03.16). Container: owns the list and the deactivation.
 */
export default function TemplateList({
  assignment,
  version,
  onCreate,
  onChanged,
}: TemplateListProps) {
  const [attempt, setAttempt] = useState(0);
  const key = `${version}|${attempt}`;
  const [state, setState] = useState<Loaded>({ status: "loading" });
  const [confirming, setConfirming] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const { term } = assignment;
  const subjectId = assignment.subject.id;

  useEffect(() => {
    const controller = new AbortController();
    listMyTemplates(1, { term, subject: subjectId }, controller.signal).then(
      (page) => {
        if (!controller.signal.aborted) setState({ status: "ready", key, templates: page.results });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", key, message: requestErrorMessage(error) });
        }
      },
    );
    return () => controller.abort();
  }, [key, term, subjectId]);

  useEffect(() => {
    if (confirming !== null) confirmButton.current?.focus();
  }, [confirming]);

  async function deactivate(template: SlotTemplate) {
    setWorking(true);
    setFailure(null);
    try {
      await deactivateTemplate(template.id);
    } catch (error) {
      setFailure(requestErrorMessage(error));
      setWorking(false);
      return;
    }
    setWorking(false);
    setConfirming(null);
    onChanged(
      `Se desactivó la plantilla del ${describe(template)}. Sus franjas futuras sin reserva se retiraron.`,
    );
  }

  const settled = state.status !== "loading" && state.key === key;
  const templates =
    settled && state.status === "ready"
      ? [...state.templates].sort((a, b) => Number(b.is_active) - Number(a.is_active))
      : [];
  const active = templates.filter((template) => template.is_active).length;

  return (
    <section className={styles.section} aria-labelledby="templates-title">
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h2 id="templates-title" className={styles.title}>
            Plantillas semanales
          </h2>
          <Button variant="ghost" size="sm" onClick={(event) => onCreate(event)}>
            <Icon name="plus" />
            Nueva
          </Button>
        </div>
        {settled && state.status === "ready" && (
          <p className={styles.lead}>
            {active > 0
              ? `${active} ${active === 1 ? "activa" : "activas"}: se repiten cada semana hasta el fin del período.`
              : "Publica la misma franja cada semana con un solo paso."}
          </p>
        )}
      </header>

      {failure && <Alert tone="error">{failure}</Alert>}

      {!settled && <div className={styles.skeleton} aria-hidden="true" />}

      {settled && state.status === "error" && (
        <div className={styles.failure}>
          <Alert tone="error">{state.message}</Alert>
          <Button variant="ghost" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            <Icon name="refresh" />
            Intentar de nuevo
          </Button>
        </div>
      )}

      {settled && state.status === "ready" && templates.length === 0 && (
        <button type="button" className={styles.empty} onClick={(event) => onCreate(event)}>
          <Icon name="repeat" size={20} />
          <span className={styles.emptyTitle}>Aún no tienes plantillas</span>
          <span className={styles.emptyText}>
            Por ejemplo, todos los miércoles a las 10:00 en el mismo salón.
          </span>
        </button>
      )}

      {templates.length > 0 && (
        <ul className={styles.list} aria-label="Tus plantillas semanales">
          {templates.map((template) => {
            const isConfirming = confirming === template.id;
            return (
              <li
                key={template.id}
                className={styles.item}
                data-inactive={!template.is_active || undefined}
              >
                <div className={styles.when}>
                  <span className={styles.weekday}>{WEEKDAY_LABELS[template.weekday]}</span>
                  <span className={styles.time}>{templateTimeRange(template.start_time)}</span>
                </div>
                <p className={styles.where}>
                  <Icon name={template.modality === "VIRTUAL" ? "video" : "place"} size={14} />
                  <span className={styles.place} title={template.location}>
                    {`${MODALITY_LABELS[template.modality]} · ${template.location}`}
                  </span>
                </p>
                <p className={styles.meta}>
                  {`${sessionLabel(template.capacity)} · ${slotsCountLabel(template.slots_created)}`}
                  {!template.is_active && <span className={styles.badge}>Inactiva</span>}
                </p>

                {template.is_active && !isConfirming && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={styles.deactivate}
                    aria-label={`Desactivar la plantilla del ${describe(template)}`}
                    onClick={() => {
                      setFailure(null);
                      setConfirming(template.id);
                    }}
                  >
                    Desactivar
                  </Button>
                )}
                {isConfirming && (
                  <div className={styles.confirm} role="group" aria-label="Confirmar desactivación">
                    <p>Se retirarán sus franjas futuras que no tengan reservas.</p>
                    <div className={styles.confirmActions}>
                      <Button
                        ref={confirmButton}
                        variant="danger"
                        size="sm"
                        softDisabled={working}
                        onClick={() => deactivate(template)}
                      >
                        {working ? "Desactivando…" : "Desactivar"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        softDisabled={working}
                        onClick={() => setConfirming(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
