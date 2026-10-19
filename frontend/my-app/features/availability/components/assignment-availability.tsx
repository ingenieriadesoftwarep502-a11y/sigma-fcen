"use client";

import { useState } from "react";

import TabList, { panelId, tabId } from "@/components/ui/tabs";
import type { MonitorOwnAssignment } from "@/lib/catalog";

import styles from "./availability.module.css";
import SlotsPanel from "./slots-panel";
import TemplatesPanel from "./templates-panel";

type View = "franjas" | "plantillas";

const TABS = [
  { key: "franjas", label: "Franjas" },
  { key: "plantillas", label: "Plantillas semanales" },
] as const satisfies readonly { key: View; label: string }[];

/**
 * Availability of one monitor assignment (T-03.16, HU-05): one-off slots and weekly
 * templates of its subject in its term, each in its own tab. The subject and term are the
 * assignment's own, so every list and form is scoped to them (RN-003.5).
 * Container: owns the tab in view.
 */
export default function AssignmentAvailability({
  assignment,
}: {
  assignment: MonitorOwnAssignment;
}) {
  const [view, setView] = useState<View>("franjas");
  const idPrefix = `assignment-${assignment.id}-availability`;

  return (
    <div className={styles.sections}>
      <TabList
        label={`Disponibilidad de ${assignment.subject.name}`}
        idPrefix={idPrefix}
        tabs={TABS}
        selected={view}
        onSelect={setView}
      />
      <div
        id={panelId(idPrefix, view)}
        role="tabpanel"
        aria-labelledby={tabId(idPrefix, view)}
        className={styles.tabPanel}
      >
        {view === "franjas" ? (
          <SlotsPanel assignment={assignment} />
        ) : (
          <TemplatesPanel assignment={assignment} />
        )}
      </div>
    </div>
  );
}
