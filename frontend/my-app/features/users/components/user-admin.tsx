"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type MouseEvent, useEffect, useEffectEvent, useRef, useState } from "react";

import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { requestErrorMessage } from "@/lib/api-client";
import { type AdminUser, listUsers, NO_FILTERS, type UserFilters, type UserPage } from "@/lib/users";

import { filtersFromParams, hasFilters, paramsFromFilters } from "../filters";
import { useUsersExport } from "../use-users-export";
import styles from "./user-admin.module.css";
import UserCreateForm from "./user-create-form";
import UserEditForm from "./user-edit-form";
import UserPanel from "./user-panel";
import UsersTable from "./users-table";
import UsersToolbar from "./users-toolbar";

/** Pause after the last keystroke before the search reaches the API. */
const SEARCH_DELAY_MS = 300;

type Query = { page: number; filters: UserFilters; attempt: number };

type ListState = {
  /** The last page received; kept while the next one loads so the table does not flash. */
  data: UserPage | null;
  error: string | null;
  /** The query the current data or error answers; any other query is still loading. */
  settled: Query | null;
};

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Read once: afterwards this component owns the filters and writes them to the URL.
  const [initialFilters] = useState(() => filtersFromParams(searchParams));
  const [fromShortcut] = useState(() => searchParams.get("nuevo") === "1");

  const [searchInput, setSearchInput] = useState(initialFilters.search);
  const [query, setQuery] = useState<Query>({ page: 1, filters: initialFilters, attempt: 0 });
  const [list, setList] = useState<ListState>({ data: null, error: null, settled: null });
  const [panel, setPanel] = useState<PanelState>(fromShortcut ? { mode: "create" } : null);
  const [notice, setNotice] = useState<string | null>(null);
  // A create, edit or access change is in flight: the drawer stays put until it settles.
  const [busy, setBusy] = useState(false);
  // What opened the drawer, so closing it puts keyboard focus back where the person was.
  const opener = useRef<HTMLElement | null>(null);
  const newUserButton = useRef<HTMLButtonElement>(null);
  const exporter = useUsersExport();

  useEffect(() => {
    const controller = new AbortController();
    listUsers(query.page, query.filters, controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        setList({ data, error: null, settled: query });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setList((current) => ({ ...current, error: requestErrorMessage(error), settled: query }));
      },
    );
    return () => controller.abort();
  }, [query]);

  // Arriving from the "Nuevo usuario" shortcut: the form is open, so drop the flag.
  useEffect(() => {
    if (!fromShortcut) return;
    const params = paramsFromFilters(initialFilters).toString();
    router.replace(params ? `${pathname}?${params}` : pathname, { scroll: false });
  }, [fromShortcut, initialFilters, pathname, router]);

  function applyFilters(filters: UserFilters) {
    if (sameFilters(filters, query.filters)) return;
    setQuery((current) => ({ page: 1, filters, attempt: current.attempt + 1 }));
    const params = paramsFromFilters(filters).toString();
    router.replace(params ? `${pathname}?${params}` : pathname, { scroll: false });
  }

  const applySearch = useEffectEvent(() => applyFilters({ ...query.filters, search: searchInput }));

  useEffect(() => {
    const timer = setTimeout(applySearch, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  /** Without a page, reloads the one in view when the update applies (not a stale closure). */
  function load(page?: number) {
    setQuery((current) => ({ ...current, page: page ?? current.page, attempt: current.attempt + 1 }));
  }

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
    load();
  }

  const loading = list.settled !== query;
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
        role={query.filters.role}
        isActive={query.filters.isActive}
        count={list.data?.count ?? null}
        exporting={exporter.exporting}
        onSearchChange={setSearchInput}
        onSearchClear={() => {
          setSearchInput("");
          applyFilters({ ...query.filters, search: "" });
        }}
        onRoleChange={(role) => applyFilters({ ...query.filters, role })}
        onStatusChange={(isActive) => applyFilters({ ...query.filters, isActive })}
        onExport={() => exporter.download(query.filters)}
      />

      {exporter.error && <Alert tone="error">{exporter.error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <UsersTable
        page={query.page}
        data={list.data}
        loading={loading}
        error={loading ? null : list.error}
        filtered={hasFilters(query.filters)}
        selectedId={selectedId}
        locked={busy}
        onSelect={(user, event) => openPanel({ mode: "edit", user }, event)}
        onPageChange={load}
        onRetry={() => load()}
        onClearFilters={clearFilters}
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
    </section>
  );
}
