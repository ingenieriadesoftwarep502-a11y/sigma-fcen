"use client";

import { type DragEvent, type FormEvent, useId, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import TextField from "@/components/ui/text-field";
import { requestErrorMessage } from "@/lib/api-client";
import {
  addVideo,
  documentFamily,
  extensionOf,
  fileProblem,
  formatFileSize,
  MAX_DESCRIPTION_LENGTH,
  MAX_FILE_BYTES,
  MAX_TITLE_LENGTH,
  type Material,
  titleFromFileName,
  uploadDocument,
  youtubeIdFrom,
  youtubeThumbnailUrl,
} from "@/lib/materials";

import type { LibrarySubject } from "./material-library";
import styles from "./material-forms.module.css";

type FormProps = {
  /** Fixed: the material goes to this subject and no other. */
  subject: LibrarySubject;
  onBusyChange: (busy: boolean) => void;
  onPublished: (material: Material) => void;
};

/** Says, before anything else, exactly where the material will be published. */
function Destination({ subject }: { subject: LibrarySubject }) {
  return (
    <div className={styles.destination}>
      <span className={styles.destinationIcon} aria-hidden="true">
        <Icon name="folder" size={18} />
      </span>
      <p>
        Se publicará en <strong>{subject.name}</strong>{" "}
        <span className={styles.destinationCode}>{subject.code}</span> y lo verán todos los
        estudiantes de la asignatura.
      </p>
    </div>
  );
}

type DescriptionProps = { id: string; value: string; onChange: (value: string) => void };

function DescriptionField({ id, value, onChange }: DescriptionProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        Descripción <span className={styles.optional}>(opcional)</span>
      </label>
      <textarea
        id={id}
        className={styles.textarea}
        rows={3}
        maxLength={MAX_DESCRIPTION_LENGTH}
        value={value}
        placeholder="Qué contiene y para qué sirve, por ejemplo: «Solución del taller 3, ejercicios 1 a 5»."
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function titleErrors(title: string): string[] {
  return title.trim() ? [] : ["Escribe un título para el material."];
}

/** Upload of one document: chosen by click or dropped on the zone, then titled. */
export function DocumentForm({ subject, onBusyChange, onPublished }: FormProps) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);

  function choose(chosen: File | null | undefined) {
    if (!chosen) return;
    setFile(chosen);
    setFileError(fileProblem(chosen));
    setMessage(null);
    // A title typed by the person is kept; only a blank one is guessed from the name.
    setTitle((current) => (current.trim() ? current : titleFromFileName(chosen.name)));
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const missingTitle = titleErrors(title);
    setErrors(missingTitle);
    if (!file) {
      setFileError("Elige el archivo que quieres subir.");
      return;
    }
    const problem = fileProblem(file);
    setFileError(problem);
    if (problem || missingTitle.length > 0) return;

    setSending(true);
    onBusyChange(true);
    setMessage(null);
    try {
      onPublished(await uploadDocument({ subjectId: subject.id, title, description, file }));
    } catch (error) {
      setMessage(requestErrorMessage(error));
      setSending(false);
      onBusyChange(false);
    }
  }

  const ext = file ? extensionOf(file.name) : "";

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <Destination subject={subject} />
      {message && <Alert tone="error">{message}</Alert>}

      <div className={styles.field}>
        <span className={styles.label} id={`${inputId}-label`}>
          Archivo
        </span>
        <label
          htmlFor={inputId}
          className={styles.dropzone}
          data-dragging={dragging || undefined}
          data-invalid={fileError ? true : undefined}
          data-filled={file ? true : undefined}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          {file ? (
            <span className={styles.chosen} data-family={documentFamily(ext)}>
              <span className={styles.chosenBadge} aria-hidden="true">
                {(ext || "?").slice(0, 5).toUpperCase()}
              </span>
              <span className={styles.chosenText}>
                <span className={styles.chosenName}>{file.name}</span>
                <span className={styles.chosenSize}>
                  {`${formatFileSize(file.size)} · Haz clic para cambiarlo`}
                </span>
              </span>
            </span>
          ) : (
            <span className={styles.prompt}>
              <span className={styles.promptIcon} aria-hidden="true">
                <Icon name="upload" size={22} />
              </span>
              <span className={styles.promptTitle}>Arrastra el archivo aquí o haz clic para elegirlo</span>
              <span className={styles.promptHint}>
                {`PDF, Word, PowerPoint, Excel, imágenes, código, .zip… hasta ${formatFileSize(MAX_FILE_BYTES)}`}
              </span>
            </span>
          )}
          <input
            id={inputId}
            type="file"
            className={styles.fileInput}
            aria-labelledby={`${inputId}-label`}
            aria-invalid={fileError ? true : undefined}
            aria-describedby={fileError ? `${inputId}-error` : undefined}
            onChange={(event) => choose(event.target.files?.[0])}
          />
        </label>
        {fileError && (
          <p id={`${inputId}-error`} className={styles.error}>
            {fileError}
          </p>
        )}
        <p className={styles.hint}>
          Por seguridad no se aceptan programas ni ejecutables (.exe, .sh, .bat, .js, .html…). Los
          videos se agregan como enlace de YouTube.
        </p>
      </div>

      <TextField
        id={`${inputId}-title`}
        label="Título"
        variant="glass"
        value={title}
        maxLength={MAX_TITLE_LENGTH}
        placeholder="Por ejemplo: Taller 3 · Derivadas"
        errors={errors}
        onChange={(event) => setTitle(event.target.value)}
      />
      <DescriptionField id={`${inputId}-description`} value={description} onChange={setDescription} />

      <Button type="submit" softDisabled={sending} className={styles.submit}>
        <Icon name="upload" size={16} />
        {sending ? "Subiendo…" : "Subir documento"}
      </Button>
    </form>
  );
}

/** A YouTube link, previewed as soon as it is recognized, then titled. */
export function VideoForm({ subject, onBusyChange, onPublished }: FormProps) {
  const formId = useId();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ url: string[]; title: string[] }>({ url: [], title: [] });
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const videoId = youtubeIdFrom(url);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const next = {
      url: videoId ? [] : ["Pega un enlace válido de un video de YouTube."],
      title: titleErrors(title),
    };
    setErrors(next);
    if (next.url.length > 0 || next.title.length > 0) return;

    setSending(true);
    onBusyChange(true);
    setMessage(null);
    try {
      onPublished(await addVideo({ subjectId: subject.id, title, description, videoUrl: url }));
    } catch (error) {
      setMessage(requestErrorMessage(error));
      setSending(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <Destination subject={subject} />
      {message && <Alert tone="error">{message}</Alert>}

      <div className={styles.field}>
        <TextField
          id={`${formId}-url`}
          label="Enlace de YouTube"
          variant="glass"
          type="url"
          inputMode="url"
          value={url}
          placeholder="https://www.youtube.com/watch?v=…"
          errors={errors.url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <p className={styles.hint}>
          Sube el video a YouTube (puede ser «no listado») y pega aquí su enlace. Los estudiantes lo
          verán dentro de la plataforma.
        </p>
      </div>

      <div className={styles.preview} data-ready={videoId ? true : undefined} aria-live="polite">
        {videoId ? (
          <span
            className={styles.previewImage}
            style={{ backgroundImage: `url(${youtubeThumbnailUrl(videoId)})` }}
            role="img"
            aria-label="Vista previa del video"
          >
            <span className={styles.previewPlay} aria-hidden="true">
              <Icon name="play" size={20} fill="currentColor" />
            </span>
          </span>
        ) : (
          <span className={styles.previewEmpty}>
            <Icon name="video" size={22} />
            {url.trim() ? "Ese enlace no es de un video de YouTube." : "La vista previa aparecerá aquí."}
          </span>
        )}
      </div>

      <TextField
        id={`${formId}-title`}
        label="Título"
        variant="glass"
        value={title}
        maxLength={MAX_TITLE_LENGTH}
        placeholder="Por ejemplo: Clase 5 · Regla de la cadena"
        errors={errors.title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <DescriptionField id={`${formId}-description`} value={description} onChange={setDescription} />

      <Button type="submit" softDisabled={sending} className={styles.submit}>
        <Icon name="video" size={16} />
        {sending ? "Publicando…" : "Publicar video"}
      </Button>
    </form>
  );
}
