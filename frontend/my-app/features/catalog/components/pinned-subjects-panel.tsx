"use client";

import { ButtonLink } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { subjectPath, SUBJECTS_PATH } from "@/lib/auth";

import { usePinnedData, usePinnedSubjects } from "../pinned-subjects";
import styles from "./pinned-subjects-panel.module.css";
import SubjectCard, { SubjectCardSkeleton } from "./subject-card";

/**
 * "Mis asignaturas" on a student's home: the subjects they pinned in the catalog, each
 * opening its own view. The pins stay in this browser (see pinned-subjects.ts).
 * Container: owns the pins of the signed-in person.
 */
export default function PinnedSubjectsPanel({ userId }: { userId: string }) {
  const pins = usePinnedSubjects(userId);
  const pinned = usePinnedData(pins.ids, null);

  return (
    <section className={styles.panel} aria-labelledby="home-pinned-title">
      <h2 id="home-pinned-title" className={styles.title}>
        Mis asignaturas
      </h2>

      {pins.ids.length === 0 ? (
        <div className={styles.empty}>
          <EmptyState
            title="Aún no has fijado asignaturas."
            action={
              <ButtonLink href={SUBJECTS_PATH} size="sm">
                Explorar asignaturas
              </ButtonLink>
            }
          >
            <p>Fija las que cursas desde Asignaturas para ver aquí sus monitores y franjas.</p>
          </EmptyState>
        </div>
      ) : (
        <ul className={styles.grid}>
          {pinned.subjects.map((subject) => (
            <li key={subject.id}>
              <SubjectCard
                subject={subject}
                href={subjectPath(subject.id)}
                pinned
                onTogglePin={() => pins.toggle(subject.id)}
              />
            </li>
          ))}
          {pinned.pending && pinned.subjects.length === 0 && (
            <li>
              <SubjectCardSkeleton />
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
