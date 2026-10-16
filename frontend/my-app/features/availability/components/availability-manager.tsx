"use client";

import { useEffect, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/ui/page-header";
import TabList, { panelId, tabId } from "@/components/ui/tabs";
import TermSelect from "@/features/catalog/components/term-select";
import { useTerms } from "@/features/catalog/use-catalog-reference";
import { requestErrorMessage } from "@/lib/api-client";
import { isTermCode, listMyAssignments, type MonitorOwnAssignment } from "@/lib/catalog";
import { useUrlQuery } from "@/lib/use-url-query";

import styles from "./availability.module.css";
import SlotsPanel from "./slots-panel";
import TemplatesPanel from "./templates-panel";

type View = "franjas" | "plantillas";

const TABS = [
  { key: "franjas", label: "Franjas" },
  { key: "plantillas", label: "Plantillas semanales" },
] as const satisfies readonly { key: View; label: string }[];

const TABS_ID = "availability";

type Section = { view: View; term: string | null };

type AssignmentsState = {
  term: string | null;
  attempt: number;
  assignments: MonitorOwnAssignment[] | null;
  error: string | null;
};

/** The monitor's assignments of the term: the subjects they may publish on (RN-003.5). */
function useAssignments(term: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AssignmentsState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listMyAssignments(term, controller.signal).then(
      (assignments) => {
        if (!controller.signal.aborted) setState({ term, attempt, assignments, error: null });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ term, attempt, assignments: null, error: requestErrorMessage(error) });
        }
      },
    );
    return () => controller.abort();
  }, [term, attempt]);

  const settled = state !== null && state.term === term && state.attempt === attempt;
  return {
    assignments: settled ? state.assignments : null,
    error: settled ? state.error : null,
    reload: () => setAttempt((value) => value + 1),
  };
}

function sectionFromParams(params: URLSearchParams): Section {
  const term = params.get("periodo");
  return {
    view: params.get("vista") === "plantillas" ? "plantillas" : "franjas",
    term: term && isTermCode(term) ? term : null,
  };
}

function paramsFromSection({ view, term }: Section): URLSearchParams {
  const params = new URLSearchParams();
  if (view !== "franjas") params.set("vista", view);
  if (term) params.set("periodo", term);
  return params;
}

/**
 * Availability management for monitors (T-03.16, HU-05): one-off slots and weekly templates
 * of a term, each in its own tab. The tab and term live in the URL.
 * Container: owns the term, the reference data and the subjects the monitor may publish on.
 */
export default function AvailabilityManager() {
  const url = useUrlQuery();
  const [section, setSection] = useState<Section>(() => sectionFromParams(url.initial));
  const { terms, current } = useTerms();
  const assignments = useAssignments(section.term);

  function change(next: Section) {
    setSection(next);
    url.replace(paramsFromSection(next));
  }

  const termCode = section.term ?? current?.code ?? null;
  const panelKey = `${section.view}-${section.term ?? "current"}`;

  return (
    <section className={styles.page} aria-labelledby="availability-title">
      <PageHeader
        title="Mi disponibilidad"
        titleId="availability-title"
        lead="Publica las franjas en que atiendes monitorías, individuales o grupales."
      >
        <TermSelect
          id="availability-term"
          value={section.term}
          terms={terms}
          current={current}
          onChange={(term) => change({ ...section, term })}
          className={styles.term}
        />
      </PageHeader>

      {assignments.error && (
        <div className={styles.failure}>
          <Alert tone="error">{`No se pudieron cargar tus asignaturas. ${assignments.error}`}</Alert>
          <Button variant="ghost" size="sm" onClick={assignments.reload}>
            <Icon name="refresh" />
            Intentar de nuevo
          </Button>
        </div>
      )}

      <div className={styles.sections}>
        <TabList
          label="Secciones de tu disponibilidad"
          idPrefix={TABS_ID}
          tabs={TABS}
          selected={section.view}
          onSelect={(view) => {
            if (view !== section.view) change({ ...section, view });
          }}
        />
        <div
          key={panelKey}
          id={panelId(TABS_ID, section.view)}
          role="tabpanel"
          aria-labelledby={tabId(TABS_ID, section.view)}
          className={styles.tabPanel}
        >
          {section.view === "franjas" ? (
            <SlotsPanel term={section.term} assignments={assignments.assignments} />
          ) : (
            <TemplatesPanel
              term={section.term}
              termCode={termCode}
              assignments={assignments.assignments}
            />
          )}
        </div>
      </div>
    </section>
  );
}
