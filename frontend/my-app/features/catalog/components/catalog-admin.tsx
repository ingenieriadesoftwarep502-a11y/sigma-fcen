"use client";

import { useEffect, useState } from "react";

import PageHeader from "@/components/ui/page-header";
import TabList, { panelId, tabId } from "@/components/ui/tabs";
import { requestErrorMessage } from "@/lib/api-client";
import { type CatalogSummary, getCatalogSummary, NO_COURSE_FILTERS } from "@/lib/catalog";
import { useUrlQuery } from "@/lib/use-url-query";

import { type CatalogView, paramsFromCourseFilters, viewFromParams } from "../filters";
import { useDepartments, useTerms } from "../use-catalog-reference";
import AssignmentsPanel from "./assignments-panel";
import styles from "./catalog-admin.module.css";
import CoursesPanel from "./courses-panel";
import CoverageBand, { type CoverageGap } from "./coverage-band";
import OrganizationPanel from "./organization-panel";
import SubjectsPanel from "./subjects-panel";

const TABS = [
  { key: "asignaturas", label: "Asignaturas" },
  { key: "cursos", label: "Cursos" },
  { key: "monitores", label: "Monitores" },
  { key: "organizacion", label: "Departamentos y períodos" },
] as const satisfies readonly { key: CatalogView; label: string }[];

const TABS_ID = "catalog";

/** The headline numbers of the current term; kept in view while they refresh. */
function useSummary() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ summary: CatalogSummary | null; error: string | null }>({
    summary: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    getCatalogSummary(null, controller.signal).then(
      (summary) => {
        if (!controller.signal.aborted) setState({ summary, error: null });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState((current) => ({ ...current, error: requestErrorMessage(error) }));
        }
      },
    );
    return () => controller.abort();
  }, [attempt]);

  return { ...state, reload: () => setAttempt((value) => value + 1) };
}

type Section = {
  view: CatalogView;
  /** The filters the tab opens with; a tab reads them once, then owns them. */
  params: URLSearchParams;
  /** Bumped on every navigation, so a tab opened again starts fresh. */
  visit: number;
};

/**
 * Catalog administration (FASE-02): coverage of the current term, then one tab per
 * catalog list. The tab and its filters live in the URL (`?vista=`).
 * Container: owns the reference data every tab shares and the coverage figures.
 */
export default function CatalogAdmin() {
  const url = useUrlQuery();
  const [section, setSection] = useState<Section>(() => ({
    view: viewFromParams(url.initial),
    params: url.initial,
    visit: 0,
  }));
  const summary = useSummary();
  const departments = useDepartments();
  const terms = useTerms();

  function open(view: CatalogView, params: URLSearchParams) {
    setSection((current) => ({ view, params, visit: current.visit + 1 }));
    url.replace(params);
  }

  function selectTab(view: CatalogView) {
    if (view !== section.view) open(view, new URLSearchParams({ vista: view }));
  }

  function showGap(gap: CoverageGap) {
    const filters = { ...NO_COURSE_FILTERS, term: summary.summary?.term ?? null, [gap]: true };
    open("cursos", paramsFromCourseFilters(filters));
  }

  const shared = {
    initial: section.params,
    terms: terms.terms,
    current: terms.current,
    onUrlChange: url.replace,
    onCatalogChange: summary.reload,
  };

  return (
    <section className={styles.admin} aria-labelledby="catalog-title">
      <PageHeader
        title="Catálogo"
        titleId="catalog-title"
        lead="Asignaturas, cursos y monitores de cada período académico."
      />

      <CoverageBand
        summary={summary.summary}
        error={summary.error}
        onRetry={summary.reload}
        onShowGap={showGap}
      />

      <div className={styles.sections}>
        <TabList
          label="Secciones del catálogo"
          idPrefix={TABS_ID}
          tabs={TABS}
          selected={section.view}
          onSelect={selectTab}
        />
        <div
          key={`${section.view}-${section.visit}`}
          id={panelId(TABS_ID, section.view)}
          role="tabpanel"
          aria-labelledby={tabId(TABS_ID, section.view)}
          className={styles.tabPanel}
        >
          {section.view === "asignaturas" && (
            <SubjectsPanel {...shared} departments={departments.departments} />
          )}
          {section.view === "cursos" && (
            <CoursesPanel {...shared} departments={departments.departments} />
          )}
          {section.view === "monitores" && <AssignmentsPanel {...shared} />}
          {section.view === "organizacion" && (
            <OrganizationPanel
              departments={departments.departments}
              departmentsError={departments.error}
              terms={terms.terms}
              current={terms.current}
              termsError={terms.error}
              onDepartmentsChange={() => {
                departments.reload();
                summary.reload();
              }}
              onTermsChange={() => {
                terms.reload();
                summary.reload();
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}
