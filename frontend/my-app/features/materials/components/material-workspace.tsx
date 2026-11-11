"use client";

import Link from "next/link";

import Alert from "@/components/ui/alert";
import Button, { ButtonLink } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import { MATERIALS_PATH } from "@/lib/auth";

// The subject header looks the same here as on the student's subject page.
import page from "../../catalog/components/subject-detail.module.css";
import MaterialLibrary from "./material-library";
import { useUploadableSubjects } from "./material-subjects";
import styles from "./material-workspace.module.css";

const ROLE_LABELS: Record<string, string> = { MONITOR: "monitor", TEACHER: "docente" };

function BackLink() {
  return (
    <Link href={MATERIALS_PATH} className={page.back}>
      <Icon name="chevron" className={page.backIcon} />
      Material
    </Link>
  );
}

/**
 * The repository of one subject as its monitor or teacher sees it: the same shelves the
 * students read, plus the upload actions, which can only publish into this subject.
 */
export default function MaterialWorkspace({ subjectId }: { subjectId: number }) {
  const { state, retry } = useUploadableSubjects();
  const subject =
    state.status === "ready" ? state.subjects.find((item) => item.id === subjectId) : undefined;

  return (
    <article className={page.page} aria-labelledby="material-subject-title">
      <BackLink />

      {state.status === "loading" && (
        <>
          <p role="status" className="sr-only">
            Cargando la asignatura…
          </p>
          <div className={page.skeleton} aria-hidden="true" />
        </>
      )}

      {state.status === "error" && (
        <div className={page.failure}>
          <Alert tone="error">{state.message}</Alert>
          <Button variant="ghost" size="sm" onClick={retry}>
            <Icon name="refresh" />
            Intentar de nuevo
          </Button>
        </div>
      )}

      {state.status === "ready" && !subject && (
        <div className={page.empty}>
          <EmptyState
            title="No puedes subir material a esta asignatura."
            action={
              <ButtonLink href={MATERIALS_PATH} variant="ghost" size="sm">
                Ver mis asignaturas
              </ButtonLink>
            }
          >
            <p>
              Solo el monitor asignado y los docentes de la asignatura en el período actual pueden
              publicar su material.
            </p>
          </EmptyState>
        </div>
      )}

      {subject && (
        <>
          <header className={page.header}>
            <div className={page.heading}>
              <p className={page.meta}>
                <span className={page.code}>{subject.code}</span>
                <span aria-hidden="true">·</span>
                <span>{subject.department}</span>
              </p>
              <h1 id="material-subject-title" className={page.title}>
                {subject.name}
              </h1>
              <p className={styles.as}>
                <Icon name="folder" size={16} />
                {`Estás publicando como ${subject.roles.map((role) => ROLE_LABELS[role] ?? role).join(" y ")} de esta asignatura. Los estudiantes lo verán en la pestaña Material.`}
              </p>
            </div>
          </header>

          <MaterialLibrary
            subject={{ id: subject.id, code: subject.code, name: subject.name }}
            canUpload
            audience="uploader"
          />
        </>
      )}
    </article>
  );
}
