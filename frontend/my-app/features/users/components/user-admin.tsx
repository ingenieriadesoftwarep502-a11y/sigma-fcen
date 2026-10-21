"use client";

import { type MouseEvent, useEffect, useEffectEvent, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Drawer from "@/components/ui/drawer";
import Icon from "@/components/ui/icon";
import { type AdminUser, listUsers, NO_FILTERS, type UserFilters } from "@/lib/users";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { usePagedList } from "@/lib/use-paged-list";
import { useUrlQuery } from "@/lib/use-url-query";

import { filtersFromParams, hasFilters, paramsFromFilters } from "../filters";
import { useUsersExport } from "../use-users-export";
import styles from "./user-admin.module.css";
import UserCreateForm from "./user-create-form";
import UserEditForm from "./user-edit-form";
import UsersTable from "./users-table";
import UsersToolbar from "./users-toolbar";

type PanelState = { mode: "create" } | { mode: "edit"; user: AdminUser } | null;

function sameFilters(a: UserFilters, b: UserFilters): boolean {
  return a.search === b.search && a.role === b.role && a.isActive === b.isActive;
}

/**
 * User administration (T-01.16, RF-020, RF-021): a filterable list of accounts, and a
 * drawer that creates or edits one. Filters live in the URL so a reload keeps them.
 * Container: owns the requests, the filters and the drawer state.
 */
export default function UserAdmin() {
  const url = useUrlQuery();
  // Read once: afterwards this component owns the filters and writes them to the URL.
  const [initialFilters] = useState(() => filtersFromParams(url.initial));
  const [fromShortcut] = useState(() => url.initial.get("nuevo") === "1");

  const [searchInput, setSearchInput] = useState(initialFilters.search);
  const search = useDebouncedValue(searchInput);
  const list = usePagedList(listUsers, initialFilters, sameFilters);
  const [panel, setPanel] = useState<PanelState>(fromShortcut ? { mode: "create" } : null);
  const [notice, setNotice] = useState<string | null>(null);
  // A create, edit or access change is in flight: the drawer stays put until it settles.
  const [busy, setBusy] = useState(false);
  // What opened the drawer, so closing it puts keyboard focus back where the person was.
  const opener = useRef<HTMLElement | null>(null);
  const newUserButton = useRef<HTMLButtonElement>(null);
  const exporter = useUsersExport();

  // Arriving from the "Nuevo usuario" shortcut: the form is open, so drop the flag.
  const dropShortcut = useEffectEvent(() => url.replace(paramsFromFilters(initialFilters)));
  useEffect(() => {
    if (fromShortcut) dropShortcut();
  }, [fromShortcut]);

  function applyFilters(filters: UserFilters) {
    if (list.setFilters(filters)) url.replace(paramsFromFilters(filters));
  }

  const applySearch = useEffectEvent((value: string) => applyFilters({ ...list.filters, search: value }));
  useEffect(() => applySearch(search), [search]);

  function clearFilters() {
    setSearchInput("");
    applyFilters(NO_FILTERS);
  }

  function openPanel(next: NonNullable<PanelState>, event: MouseEvent<HTMLElement>) {
    opener.current = event.currentTarget;
    setNotice(null);
    setPanel(next);
  }

  function closePanel() {
    setPanel(null);
    const target = opener.current?.isConnected ? opener.current : newUserButton.current;
    target?.focus();
  }

  function handleSaved(message: string) {
    setNotice(message);
    setBusy(false);
    closePanel();
    list.reload();
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
        <Button
          ref={newUserButton}
          size="sm"
          disabled={busy}
          onClick={(event) => openPanel({ mode: "create" }, event)}
        >
          <Icon name="plus" />
          Nuevo usuario
        </Button>
      </header>

      <UsersToolbar
        search={searchInput}
        role={list.filters.role}
        isActive={list.filters.isActive}
        count={list.data?.count ?? null}
        exporting={exporter.exporting}
        onSearchChange={setSearchInput}
        onSearchClear={() => {
          setSearchInput("");
          applyFilters({ ...list.filters, search: "" });
        }}
        onRoleChange={(role) => applyFilters({ ...list.filters, role })}
        onStatusChange={(isActive) => applyFilters({ ...list.filters, isActive })}
        onExport={() => exporter.download(list.filters)}
      />

      {exporter.error && <Alert tone="error">{exporter.error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <UsersTable
        page={list.page}
        data={list.data}
        loading={list.loading}
        error={list.error}
        filtered={hasFilters(list.filters)}
        selectedId={selectedId}
        locked={busy}
        onSelect={(user, event) => openPanel({ mode: "edit", user }, event)}
        onPageChange={list.goTo}
        onRetry={list.reload}
        onClearFilters={clearFilters}
      />

      {panel?.mode === "create" && (
        <Drawer key="create" title="Nuevo usuario" locked={busy} onClose={closePanel}>
          <UserCreateForm
            onCreated={(user) => handleSaved(`Se creó la cuenta de ${user.email}.`)}
            onBusyChange={setBusy}
          />
        </Drawer>
      )}
      {panel?.mode === "edit" && (
        <Drawer
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
        </Drawer>
      )}
    </section>
  );
}
