"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Drawer from "@/components/ui/drawer";
import EmptyState from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";
import TabList, { panelId, tabId } from "@/components/ui/tabs";
import ToggleChip from "@/components/ui/toggle-chip";
import { requestErrorMessage } from "@/lib/api-client";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import {
  type DocumentFamily,
  documentFamily,
  downloadMaterial,
  FAMILY_LABELS,
  FAMILY_ORDER,
  formatFileSize,
  listMaterials,
  type Material,
  type MaterialKind,
  removeMaterial,
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from "@/lib/materials";

import { DocumentForm, VideoForm } from "./material-forms";
import styles from "./material-library.module.css";

export type LibrarySubject = { id: number; code: string; name: string };

type Shelf =
  | { status: "loading" }
  | { status: "ready"; items: Material[]; count: number; page: number; more: boolean }
  | { status: "error"; message: string };

const KIND_TABS = [
  { key: "DOCUMENT", label: "Documentos" },
  { key: "VIDEO", label: "Videos" },
] as const satisfies readonly { key: MaterialKind; label: string }[];

function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Every material of one kind for the subject. A new `version` reloads it from the first page;
 * `loadMore` appends the next one. Until the answer for the current key arrives, it is loading.
 */
function useShelf(subjectId: number, kind: MaterialKind, version: number) {
  const key = `${subjectId}:${kind}:${version}`;
  const [loaded, setLoaded] = useState<{ key: string; shelf: Shelf } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    listMaterials(subjectId, kind, 1, controller.signal).then(
      (page) => {
        if (controller.signal.aborted) return;
        setLoaded({
          key,
          shelf: {
            status: "ready",
            items: page.results,
            count: page.count,
            page: 1,
            more: page.next !== null,
          },
        });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({ key, shelf: { status: "error", message: requestErrorMessage(error) } });
        }
      },
    );
    return () => controller.abort();
  }, [subjectId, kind, key]);

  const shelf: Shelf = loaded?.key === key ? loaded.shelf : { status: "loading" };

  async function loadMore() {
    if (shelf.status !== "ready" || !shelf.more || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await listMaterials(subjectId, kind, shelf.page + 1);
      setLoaded({
        key,
        shelf: {
          status: "ready",
          items: [...shelf.items, ...next.results],
          count: next.count,
          page: shelf.page + 1,
          more: next.next !== null,
        },
      });
    } catch (error) {
      setLoaded({ key, shelf: { status: "error", message: requestErrorMessage(error) } });
    } finally {
      setLoadingMore(false);
    }
  }

  return { shelf, loadMore, loadingMore };
}

type RemoveProps = { material: Material; onRemoved: (material: Material) => void };

/** Removing asks once more in place, so a stray click never takes material away. */
function RemoveControl({ material, onRemoved }: RemoveProps) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await removeMaterial(material.id);
      onRemoved(material);
    } catch (failure) {
      setError(requestErrorMessage(failure));
      setBusy(false);
    }
  }

  if (!asking) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={styles.iconButton}
        aria-label={`Retirar ${material.title}`}
        title="Retirar"
        onClick={() => setAsking(true)}
      >
        <Icon name="trash" size={16} />
      </Button>
    );
  }
  return (
    <div className={styles.confirm} role="group" aria-label={`Retirar ${material.title}`}>
      <span className={styles.confirmText}>¿Retirar?</span>
      <Button variant="danger" size="sm" softDisabled={busy} onClick={confirm}>
        {busy ? "Retirando…" : "Retirar"}
      </Button>
      <Button variant="ghost" size="sm" softDisabled={busy} onClick={() => setAsking(false)}>
        Cancelar
      </Button>
      {error && <span className={styles.confirmError}>{error}</span>}
    </div>
  );
}

function Byline({ material }: { material: Material }) {
  return (
    <span className={styles.byline}>
      <span>{material.uploaded_by.full_name || "Sin nombre"}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={material.created_at} title={formatDateTime(material.created_at)}>
        {formatRelativeTime(material.created_at)}
      </time>
    </span>
  );
}

type ItemProps = { material: Material; index: number; onRemoved: (material: Material) => void };

function DocumentItem({ material, index, onRemoved }: ItemProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const family = documentFamily(material.file_extension);
  const ext = (material.file_extension ?? "").slice(0, 5).toUpperCase() || "DOC";

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      await downloadMaterial(material);
    } catch (failure) {
      setError(requestErrorMessage(failure));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <li className={styles.doc} data-family={family} style={{ "--i": Math.min(index, 10) } as CSSProperties}>
      <span className={styles.badge} aria-hidden="true">
        <Icon name="file" size={18} />
        <span className={styles.badgeExt}>{ext}</span>
      </span>
      <div className={styles.docBody}>
        <p className={styles.itemTitle}>{material.title}</p>
        {material.description && <p className={styles.description}>{material.description}</p>}
        <p className={styles.meta}>
          <span className={styles.fileName} title={material.file_name ?? undefined}>
            {material.file_name}
          </span>
          {material.size_bytes !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span>{formatFileSize(material.size_bytes)}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <Byline material={material} />
        </p>
        {error && <p className={styles.itemError}>{error}</p>}
      </div>
      <div className={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          softDisabled={downloading}
          aria-label={`Descargar ${material.title}`}
          onClick={download}
        >
          <Icon name="download" size={16} />
          <span className={styles.actionLabel}>{downloading ? "Descargando…" : "Descargar"}</span>
        </Button>
        {material.can_delete && <RemoveControl material={material} onRemoved={onRemoved} />}
      </div>
    </li>
  );
}

/**
 * A video shows its YouTube poster until someone presses play; only then does the player
 * load, so a page full of videos stays light and sets no cookies.
 */
function VideoItem({ material, index, onRemoved }: ItemProps) {
  const [playing, setPlaying] = useState(false);
  const id = material.youtube_id ?? "";

  return (
    <li className={styles.video} style={{ "--i": Math.min(index, 10) } as CSSProperties}>
      <div className={styles.screen}>
        {playing ? (
          <iframe
            className={styles.player}
            src={youtubeEmbedUrl(id, true)}
            title={material.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            className={styles.poster}
            style={{ backgroundImage: `url(${youtubeThumbnailUrl(id)})` }}
            aria-label={`Reproducir ${material.title}`}
            onClick={() => setPlaying(true)}
          >
            <span className={styles.play} aria-hidden="true">
              <Icon name="play" size={22} fill="currentColor" />
            </span>
          </button>
        )}
      </div>
      <div className={styles.videoBody}>
        <p className={styles.itemTitle}>{material.title}</p>
        {material.description && <p className={styles.description}>{material.description}</p>}
        <div className={styles.videoFooter}>
          <p className={styles.meta}>
            <Byline material={material} />
          </p>
          <div className={styles.actions}>
            <a
              className={styles.external}
              href={youtubeWatchUrl(id)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir ${material.title} en YouTube`}
              title="Abrir en YouTube"
            >
              <Icon name="external" size={16} />
            </a>
            {material.can_delete && <RemoveControl material={material} onRemoved={onRemoved} />}
          </div>
        </div>
      </div>
    </li>
  );
}

type LibraryProps = {
  subject: LibrarySubject;
  /** The monitor or teacher of the subject: shows the upload actions. */
  canUpload: boolean;
  /** What to say when there is nothing yet, from the reader's side. */
  audience: "student" | "uploader";
};

type Panel = "DOCUMENT" | "VIDEO" | null;

/**
 * The repository of one subject (FASE-07): documents and videos on separate tabs, documents
 * filterable by what they are (PDF, presentations, spreadsheets…), videos playable in place.
 * Monitors and teachers of the subject add material from here, into this subject only.
 */
export default function MaterialLibrary({ subject, canUpload, audience }: LibraryProps) {
  const [tab, setTab] = useState<MaterialKind>("DOCUMENT");
  const [versions, setVersions] = useState({ DOCUMENT: 0, VIDEO: 0 });
  const documents = useShelf(subject.id, "DOCUMENT", versions.DOCUMENT);
  const videos = useShelf(subject.id, "VIDEO", versions.VIDEO);
  const [family, setFamily] = useState<DocumentFamily | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  const reload = (kind: MaterialKind) =>
    setVersions((current) => ({ ...current, [kind]: current[kind] + 1 }));

  function open(kind: MaterialKind, button: HTMLButtonElement) {
    opener.current = button;
    setNotice(null);
    setPanel(kind);
  }

  function close() {
    setPanel(null);
    opener.current?.focus();
  }

  function published(material: Material) {
    setPanel(null);
    setBusy(false);
    setTab(material.kind);
    if (material.kind === "DOCUMENT") setFamily(null);
    reload(material.kind);
    const where = material.kind === "DOCUMENT" ? "Documentos" : "Videos";
    setNotice(`«${material.title}» quedó publicado en ${where}.`);
  }

  function removed(material: Material) {
    reload(material.kind);
    setNotice(`Se retiró «${material.title}».`);
  }

  const counts = {
    DOCUMENT: documents.shelf.status === "ready" ? documents.shelf.count : null,
    VIDEO: videos.shelf.status === "ready" ? videos.shelf.count : null,
  };
  const tabs = KIND_TABS.map((item) => ({
    key: item.key,
    label: counts[item.key] === null ? item.label : `${item.label} · ${counts[item.key]}`,
  }));
  const current = tab === "DOCUMENT" ? documents : videos;
  const items = current.shelf.status === "ready" ? current.shelf.items : [];
  const families = FAMILY_ORDER.filter((value) =>
    tab === "DOCUMENT" ? items.some((item) => documentFamily(item.file_extension) === value) : false,
  );
  const shown =
    tab === "DOCUMENT" && family
      ? items.filter((item) => documentFamily(item.file_extension) === family)
      : items;
  const idPrefix = `material-${subject.id}`;

  return (
    <section className={styles.library} aria-labelledby={`${idPrefix}-title`}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 id={`${idPrefix}-title`} className={styles.title}>
            Material de apoyo
          </h2>
          {counts.DOCUMENT !== null && counts.VIDEO !== null && (
            <p className={styles.summary}>
              {`${countLabel(counts.DOCUMENT, "documento", "documentos")} · ${countLabel(counts.VIDEO, "video", "videos")}`}
            </p>
          )}
        </div>
        {canUpload && (
          <div className={styles.uploadActions}>
            <Button variant="ghost" size="sm" onClick={(event) => open("VIDEO", event.currentTarget)}>
              <Icon name="video" size={16} />
              Agregar video
            </Button>
            <Button size="sm" onClick={(event) => open("DOCUMENT", event.currentTarget)}>
              <Icon name="upload" size={16} />
              Subir documento
            </Button>
          </div>
        )}
      </header>

      {notice && <Alert tone="success">{notice}</Alert>}

      <TabList
        label="Tipo de material"
        idPrefix={idPrefix}
        tabs={tabs}
        selected={tab}
        onSelect={setTab}
      />

      <div
        role="tabpanel"
        id={panelId(idPrefix, tab)}
        aria-labelledby={tabId(idPrefix, tab)}
        className={styles.panel}
      >
        {current.shelf.status === "loading" && (
          <>
            <p role="status" className="sr-only">
              Cargando el material…
            </p>
            <div className={tab === "DOCUMENT" ? styles.docs : styles.videos} aria-hidden="true">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className={tab === "DOCUMENT" ? styles.docSkeleton : styles.videoSkeleton}
                />
              ))}
            </div>
          </>
        )}

        {current.shelf.status === "error" && (
          <div className={styles.failure}>
            <Alert tone="error">{current.shelf.message}</Alert>
            <Button variant="ghost" size="sm" onClick={() => reload(tab)}>
              <Icon name="refresh" />
              Intentar de nuevo
            </Button>
          </div>
        )}

        {current.shelf.status === "ready" && items.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <Icon name={tab === "DOCUMENT" ? "file" : "video"} size={22} />
            </span>
            <EmptyState
              title={
                tab === "DOCUMENT"
                  ? "Todavía no hay documentos en esta asignatura."
                  : "Todavía no hay videos en esta asignatura."
              }
            >
              <p>
                {audience === "uploader"
                  ? tab === "DOCUMENT"
                    ? "Sube guías, talleres, presentaciones o cualquier archivo que ayude a tus estudiantes."
                    : "Pega el enlace de un video de YouTube: se verá aquí mismo, sin salir de la plataforma."
                  : "Cuando el monitor o el docente publiquen material, lo encontrarás aquí."}
              </p>
            </EmptyState>
          </div>
        )}

        {tab === "DOCUMENT" && families.length > 1 && (
          <div className={styles.filters} role="group" aria-label="Filtrar documentos por tipo">
            <ToggleChip pressed={family === null} onClick={() => setFamily(null)}>
              Todos
            </ToggleChip>
            {families.map((value) => (
              <ToggleChip
                key={value}
                pressed={family === value}
                onClick={() => setFamily(family === value ? null : value)}
              >
                {FAMILY_LABELS[value]}
              </ToggleChip>
            ))}
          </div>
        )}

        {shown.length > 0 && tab === "DOCUMENT" && (
          <ul className={styles.docs} aria-label={`Documentos de ${subject.name}`}>
            {shown.map((material, index) => (
              <DocumentItem key={material.id} material={material} index={index} onRemoved={removed} />
            ))}
          </ul>
        )}
        {shown.length > 0 && tab === "VIDEO" && (
          <ul className={styles.videos} aria-label={`Videos de ${subject.name}`}>
            {shown.map((material, index) => (
              <VideoItem key={material.id} material={material} index={index} onRemoved={removed} />
            ))}
          </ul>
        )}

        {current.shelf.status === "ready" && current.shelf.more && (
          <div className={styles.more}>
            <Button
              variant="ghost"
              size="sm"
              softDisabled={current.loadingMore}
              onClick={current.loadMore}
            >
              {current.loadingMore ? "Cargando…" : "Ver más"}
            </Button>
          </div>
        )}
      </div>

      {panel && (
        <Drawer
          title={panel === "DOCUMENT" ? "Subir documento" : "Agregar video"}
          subtitle={`${subject.code} · ${subject.name}`}
          locked={busy}
          onClose={close}
        >
          {panel === "DOCUMENT" ? (
            <DocumentForm subject={subject} onBusyChange={setBusy} onPublished={published} />
          ) : (
            <VideoForm subject={subject} onBusyChange={setBusy} onPublished={published} />
          )}
        </Drawer>
      )}
    </section>
  );
}
