import React from "react";
import {
  getActiveSelection,
  getRegisteredBackends,
  getSnapshot,
  setActiveSelection,
  setRegisteredBackends,
  subscribeActiveBackend,
} from "#/api/backend-registry/active-store";
import { makeDefaultLocalBackend } from "#/api/backend-registry/default-backend";
import {
  dropBackendHealth,
  resetBackendHealth,
} from "#/api/backend-registry/health-store";
import {
  type Backend,
  type BackendSelection,
  type ResolvedActiveBackend,
} from "#/api/backend-registry/types";
import {
  deleteCloudBackendCredential,
  saveCloudBackendCredential,
} from "#/api/cloud-backend-credentials-service";

interface ActiveBackendContextValue {
  backends: Backend[];
  active: ResolvedActiveBackend;
  setActive: (backendId: string, orgId?: string | null) => void;
  addBackend: (backend: Omit<Backend, "id">) => Promise<Backend>;
  updateBackend: (
    id: string,
    patch: Partial<Omit<Backend, "id">>,
  ) => Promise<void>;
  removeBackend: (id: string) => Promise<void>;
}

const ActiveBackendContext =
  React.createContext<ActiveBackendContextValue | null>(null);

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Backend mutation was aborted", "AbortError");
  }
}

async function persistCloudBackendCredential(
  backend: Backend,
  signal?: AbortSignal,
): Promise<void> {
  if (backend.kind !== "cloud" || !backend.apiKey.trim()) return;
  throwIfAborted(signal);

  try {
    await saveCloudBackendCredential(
      {
        id: backend.id,
        name: backend.name,
        host: backend.host,
        cloudApiKey: backend.apiKey,
      },
      { signal },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Failed to persist Cloud backend credentials", {
      cause: error,
    });
  }
}

async function deletePersistedCloudBackendCredential(
  backend?: Backend,
  signal?: AbortSignal,
): Promise<void> {
  if (backend?.kind !== "cloud") return;
  throwIfAborted(signal);

  try {
    await deleteCloudBackendCredential(backend.id, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Failed to delete persisted Cloud backend credentials", {
      cause: error,
    });
  }
}

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

  const backendMutationQueueRef = React.useRef<Promise<void>>(
    Promise.resolve(),
  );
  const backendMutationAbortRef = React.useRef(new AbortController());

  React.useEffect(
    () => () => {
      backendMutationAbortRef.current.abort();
    },
    [],
  );

  const enqueueBackendMutation = React.useCallback(
    async <T,>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      const signal = backendMutationAbortRef.current.signal;
      throwIfAborted(signal);
      const run = backendMutationQueueRef.current.then(
        () => operation(signal),
        () => operation(signal),
      );
      backendMutationQueueRef.current = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    [],
  );

  const setActive = React.useCallback(
    (backendId: string, orgId?: string | null) => {
      const prevBackendId = getActiveSelection()?.backendId ?? null;
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
    async (backend: Omit<Backend, "id">): Promise<Backend> =>
      enqueueBackendMutation(async (signal) => {
        const next: Backend = { ...backend, id: generateId() };
        await persistCloudBackendCredential(next, signal);
        throwIfAborted(signal);
        const list = [...getRegisteredBackends(), next];
        setRegisteredBackends(list);
        return next;
      }),
    [enqueueBackendMutation],
  );

  const updateBackend = React.useCallback(
    async (id: string, patch: Partial<Omit<Backend, "id">>): Promise<void> =>
      enqueueBackendMutation(async (signal) => {
        const currentBackends = getRegisteredBackends();
        const prev = currentBackends.find((b) => b.id === id);
        const list = currentBackends.map((b) =>
          b.id === id ? { ...b, ...patch } : b,
        );
        const next = list.find((backend) => backend.id === id);

        if (next?.kind === "cloud" && next.apiKey.trim()) {
          await persistCloudBackendCredential(next, signal);
        } else {
          await deletePersistedCloudBackendCredential(prev, signal);
        }
        throwIfAborted(signal);

        setRegisteredBackends(list);

        // Re-arm health polling when the user edits the fields that
        // actually drive the probe. Cosmetic edits (name) shouldn't
        // re-enable a backend that was disabled for being unreachable.
        const hostChanged =
          patch.host !== undefined &&
          prev !== undefined &&
          patch.host !== prev.host;
        const apiKeyChanged =
          patch.apiKey !== undefined &&
          prev !== undefined &&
          patch.apiKey !== prev.apiKey;
        if (hostChanged || apiKeyChanged) {
          resetBackendHealth(id);
        }
      }),
    [enqueueBackendMutation],
  );

  const removeBackend = React.useCallback(
    async (id: string): Promise<void> =>
      enqueueBackendMutation(async (signal) => {
        const currentBackends = getRegisteredBackends();
        const removed = currentBackends.find((backend) => backend.id === id);
        await deletePersistedCloudBackendCredential(removed, signal);
        throwIfAborted(signal);
        const list = currentBackends.filter((b) => b.id !== id);
        setRegisteredBackends(list);
        dropBackendHealth(id);
        // If the active selection pointed at this backend, the active
        // store falls back to the first remaining local backend (or the
        // env-derived default if no locals exist); consumer hooks re-key
        // by the new active backend identity and refetch automatically.
      }),
    [enqueueBackendMutation],
  );

  const value = React.useMemo<ActiveBackendContextValue>(
    () => ({
      backends: snapshot.backends,
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
 * Falls back to a synthesized env-derived local backend when called
 * outside an `<ActiveBackendProvider>` (e.g. from a unit test that
 * mounts a narrow component without the full provider stack). That
 * synthesized backend is identical to the seed used on first install.
 *
 * Components that need to mutate state (`setActive`, `addBackend`,
 * etc.) must use `useActiveBackendContext()` directly — that throws if
 * the provider is missing, since mutation requires the live store.
 */
export function useActiveBackend(): ResolvedActiveBackend {
  const ctx = React.useContext(ActiveBackendContext);
  if (ctx) return ctx.active;
  return { backend: makeDefaultLocalBackend(), orgId: null };
}
