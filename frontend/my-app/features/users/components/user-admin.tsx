"use client";

import { type MouseEvent, useEffect, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import { requestErrorMessage } from "@/lib/api-client";
import { type AdminUser, listUsers, type UserPage } from "@/lib/users";

import styles from "./user-admin.module.css";
import UserCreateForm from "./user-create-form";
import UserEditForm from "./user-edit-form";
import UserPanel from "./user-panel";
import UsersTable from "./users-table";

type ListState = {
  /** The last page received; kept while the next one loads so the table does not flash. */
  data: UserPage | null;
  loading: boolean;
  error: string | null;
};

type PanelState = { mode: "create" } | { mode: "edit"; user: AdminUser } | null;

/**
 * User administration (T-01.16, RF-020, RF-021): the table stays in view while a side
 * panel creates or edits one account. Container: owns the requests and the panel state.
 */
export default function UserAdmin() {
  const [query, setQuery] = useState({ page: 1, attempt: 0 });
  const [list, setList] = useState<ListState>({ data: null, loading: true, error: null });
  const [panel, setPanel] = useState<PanelState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // A create, edit or access change is in flight: the panel stays put until it settles.
  const [busy, setBusy] = useState(false);
  // What opened the panel, so closing it puts keyboard focus back where the person was.
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listUsers(query.page, controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        setList({ data, loading: false, error: null });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setList((current) => ({ ...current, loading: false, error: requestErrorMessage(error) }));
      },
    );
    return () => controller.abort();
  }, [query]);

  /** Without a page, reloads the one in view when the update applies (not a stale closure). */
  function load(page?: number) {
    setList((current) => ({ ...current, loading: true, error: null }));
    setQuery((current) => ({ page: page ?? current.page, attempt: current.attempt + 1 }));
  }

  function openPanel(next: NonNullable<PanelState>, event: MouseEvent<HTMLElement>) {
    opener.current = event.currentTarget;
    setNotice(null);
    setPanel(next);
  }

  function closePanel() {
    setPanel(null);
    if (opener.current?.isConnected) opener.current.focus();
  }

  function handleSaved(message: string) {
    setNotice(message);
    setBusy(false);
    closePanel();
    load();
  }

  const selectedId = panel?.mode === "edit" ? panel.user.id : null;

  return (
    <section className={styles.admin} aria-labelledby="users-title">
      <header className={styles.header}>
        <div>
          <h1 id="users-title" className={styles.title}>
            Usuarios
          </h1>
          <p className={styles.lead}>Crea cuentas, asigna roles y controla el acceso.</p>
        </div>
        <Button disabled={busy} onClick={(event) => openPanel({ mode: "create" }, event)}>
          Nuevo usuario
        </Button>
      </header>

      {notice && <Alert tone="success">{notice}</Alert>}

      <div className={styles.workspace} data-panel={panel ? "open" : "closed"}>
        <UsersTable
          page={query.page}
          data={list.data}
          loading={list.loading}
          error={list.error}
          selectedId={selectedId}
          locked={busy}
          onSelect={(user, event) => openPanel({ mode: "edit", user }, event)}
          onPageChange={load}
          onRetry={() => load()}
        />

        {panel?.mode === "create" && (
          <UserPanel key="create" title="Nuevo usuario" locked={busy} onClose={closePanel}>
            <UserCreateForm
              onCreated={(user) => handleSaved(`Se creó la cuenta de ${user.email}.`)}
              onBusyChange={setBusy}
            />
          </UserPanel>
        )}
        {panel?.mode === "edit" && (
          <UserPanel
            key={panel.user.id}
            title="Editar usuario"
            subtitle={panel.user.email}
            locked={busy}
            onClose={closePanel}
          >
            <UserEditForm
              user={panel.user}
              locked={busy}
              onSaved={handleSaved}
              onBusyChange={setBusy}
            />
          </UserPanel>
        )}
      </div>
    </section>
  );
}
