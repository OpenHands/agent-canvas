import React from "react";
import {
  getActiveSelection,
  getRegisteredBackends,
  getSnapshot,
  setActiveSelection,
  setRegisteredBackends,
  subscribeActiveBackend,
} from "#/api/backend-registry/active-store";
import { getBundledBackend } from "#/api/backend-registry/bundled";
import {
  type Backend,
  type BackendSelection,
  type ResolvedActiveBackend,
  BUNDLED_BACKEND_ID,
} from "#/api/backend-registry/types";

interface ActiveBackendContextValue {
  backends: Backend[];
  bundledBackend: Backend;
  active: ResolvedActiveBackend;
  setActive: (backendId: string, orgId?: string | null) => void;
  addBackend: (backend: Omit<Backend, "id">) => Backend;
  updateBackend: (id: string, patch: Partial<Omit<Backend, "id">>) => void;
  removeBackend: (id: string) => void;
}

const ActiveBackendContext =
  React.createContext<ActiveBackendContextValue | null>(null);

function generateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `backend-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ActiveBackendProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const snapshot = React.useSyncExternalStore(
    subscribeActiveBackend,
    getSnapshot,
    getSnapshot,
  );

  const setActive = React.useCallback(
    (backendId: string, orgId?: string | null) => {
      const prevBackendId =
        getActiveSelection()?.backendId ?? BUNDLED_BACKEND_ID;
      const prevOrgId = getActiveSelection()?.orgId ?? null;
      const nextOrgId = orgId ?? null;

      if (backendId === prevBackendId && nextOrgId === prevOrgId) return;

      const next: BackendSelection = { backendId, orgId: nextOrgId };
      setActiveSelection(next);

      // No blanket `invalidateQueries()` here. Long-lived queries
      // (`useSettings`, `usePaginatedConversations`,
      // `useGitRepositories`, `useAppInstallations`,
      // `useCloudCurrentUserId`, `useGitUser`, …) include the active
      // backend's `id` and `orgId` in their query keys, so React Query
      // treats a backend/org switch as a brand-new query and fetches
      // automatically — once, with no duplicate waves.
    },
    [],
  );

  const addBackend = React.useCallback(
    (backend: Omit<Backend, "id">): Backend => {
      const next: Backend = { ...backend, id: generateId() };
      const list = [...getRegisteredBackends(), next];
      setRegisteredBackends(list);
      return next;
    },
    [],
  );

  const updateBackend = React.useCallback(
    (id: string, patch: Partial<Omit<Backend, "id">>) => {
      const list = getRegisteredBackends().map((b) =>
        b.id === id ? { ...b, ...patch } : b,
      );
      setRegisteredBackends(list);
    },
    [],
  );

  const removeBackend = React.useCallback((id: string) => {
    if (id === BUNDLED_BACKEND_ID) return;
    const list = getRegisteredBackends().filter((b) => b.id !== id);
    setRegisteredBackends(list);
    // If the active selection pointed at this backend, the active
    // store falls back to bundled; consumer hooks re-key by the new
    // active backend identity and refetch automatically. No blanket
    // invalidate needed.
  }, []);

  const value = React.useMemo<ActiveBackendContextValue>(
    () => ({
      backends: snapshot.backends,
      bundledBackend: getBundledBackend(),
      active: snapshot.active,
      setActive,
      addBackend,
      updateBackend,
      removeBackend,
    }),
    [snapshot, setActive, addBackend, updateBackend, removeBackend],
  );

  return (
    <ActiveBackendContext.Provider value={value}>
      {children}
    </ActiveBackendContext.Provider>
  );
}

export function useActiveBackendContext(): ActiveBackendContextValue {
  const ctx = React.useContext(ActiveBackendContext);
  if (!ctx) {
    throw new Error(
      "useActiveBackendContext must be used inside <ActiveBackendProvider>",
    );
  }
  return ctx;
}

/**
 * Read the resolved active backend.
 *
 * Falls back to the bundled local backend when called outside an
 * `<ActiveBackendProvider>` (e.g. from a unit test that mounts a
 * narrow component without the full provider stack). The bundled
 * backend is a pure function of env vars + window.location, so this
 * fallback is identical to what an empty active selection resolves to.
 *
 * Components that need to mutate state (`setActive`, `addBackend`,
 * etc.) must use `useActiveBackendContext()` directly — that throws if
 * the provider is missing, since mutation requires the live store.
 */
export function useActiveBackend(): ResolvedActiveBackend {
  const ctx = React.useContext(ActiveBackendContext);
  if (ctx) return ctx.active;
  return { backend: getBundledBackend(), orgId: null };
}
