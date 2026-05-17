import React from "react";
import toast from "react-hot-toast";
import {
  getActiveSelection,
  getSnapshot,
  setActiveSelection,
  subscribeActiveBackend,
  updateRegisteredBackends,
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

const CLOUD_BACKEND_PERSISTENCE_ERROR =
  "Failed to save backend credentials locally.";
const CLOUD_BACKEND_DELETE_ERROR =
  "Failed to delete backend credentials locally.";

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "ERR_CANCELED")
  );
}

async function persistCloudBackendCredential(
  backend: Backend,
  options: { signal?: AbortSignal } = {},
) {
  if (backend.kind !== "cloud" || !backend.apiKey.trim()) return true;

  await saveCloudBackendCredential(
    {
      id: backend.id,
      name: backend.name,
      host: backend.host,
      cloudApiKey: backend.apiKey,
    },
    {
      signal: options.signal,
    },
  );
  return true;
}

function removeFailedNewBackend({
  backendId,
  message,
  pendingNewCloudBackendIds,
}: {
  backendId: string;
  message: string;
  pendingNewCloudBackendIds: Set<string>;
}) {
  if (!pendingNewCloudBackendIds.has(backendId)) return;
  pendingNewCloudBackendIds.delete(backendId);
  updateRegisteredBackends((currentBackends) =>
    currentBackends.filter((current) => current.id !== backendId),
  );
  toast.error(message);
}

function isCurrentBackendPersistenceVersion(
  backendPersistenceVersions: Map<string, number>,
  id: string,
  version: number,
) {
  return backendPersistenceVersions.get(id) === version;
}

function removePendingNewBackendIfCurrent({
  backendPersistenceVersions,
  pendingNewCloudBackendIds,
  backendId,
  operationVersion,
}: {
  backendPersistenceVersions: Map<string, number>;
  pendingNewCloudBackendIds: Set<string>;
  backendId: string;
  operationVersion: number;
}) {
  if (
    isCurrentBackendPersistenceVersion(
      backendPersistenceVersions,
      backendId,
      operationVersion,
    )
  ) {
    pendingNewCloudBackendIds.delete(backendId);
  }
}

function restoreFailedBackendUpdate({
  backendPersistenceVersions,
  backendId,
  operationVersion,
  rollbackBackend,
  message,
}: {
  backendPersistenceVersions: Map<string, number>;
  backendId: string;
  operationVersion: number;
  rollbackBackend: Backend;
  message: string;
}) {
  let didRollback = false;
  updateRegisteredBackends((currentBackends) =>
    isCurrentBackendPersistenceVersion(
      backendPersistenceVersions,
      backendId,
      operationVersion,
    )
      ? currentBackends.map((backend) => {
          if (backend.id !== backendId) return backend;
          didRollback = true;
          return {
            ...backend,
            ...buildRollbackPatchFromBackend(rollbackBackend, backend),
          };
        })
      : currentBackends,
  );
  if (didRollback) toast.error(message);
}

function buildRollbackPatchFromBackend(
  rollbackBackend: Backend,
  currentBackend: Backend,
) {
  const rollbackPatch: Partial<Omit<Backend, "id">> = {};
  if (currentBackend.name !== rollbackBackend.name) {
    rollbackPatch.name = rollbackBackend.name;
  }
  if (currentBackend.host !== rollbackBackend.host) {
    rollbackPatch.host = rollbackBackend.host;
  }
  if (currentBackend.apiKey !== rollbackBackend.apiKey) {
    rollbackPatch.apiKey = rollbackBackend.apiKey;
  }
  if (currentBackend.kind !== rollbackBackend.kind) {
    rollbackPatch.kind = rollbackBackend.kind;
  }
  return rollbackPatch;
}

function getPersistedRollbackBackend(
  lastPersistedCloudBackends: Map<string, Backend>,
  previousBackend: Backend,
) {
  if (previousBackend.kind !== "cloud") return previousBackend;
  return lastPersistedCloudBackends.get(previousBackend.id) ?? previousBackend;
}

function restoreFailedBackendRemoval({
  backendPersistenceVersions,
  lastPersistedCloudBackends,
  previousBackends,
  removedBackend,
  operationVersion,
  message,
}: {
  backendPersistenceVersions: Map<string, number>;
  lastPersistedCloudBackends: Map<string, Backend>;
  previousBackends: Backend[];
  removedBackend: Backend;
  operationVersion: number;
  message: string;
}) {
  let didRollback = false;
  const rollbackBackend =
    lastPersistedCloudBackends.get(removedBackend.id) ?? removedBackend;
  updateRegisteredBackends((currentBackends) => {
    if (
      !isCurrentBackendPersistenceVersion(
        backendPersistenceVersions,
        removedBackend.id,
        operationVersion,
      )
    ) {
      return currentBackends;
    }
    if (currentBackends.some((backend) => backend.id === removedBackend.id)) {
      return currentBackends;
    }

    const previousIndex = previousBackends.findIndex(
      (backend) => backend.id === removedBackend.id,
    );
    const nextBackends = [...currentBackends];
    nextBackends.splice(
      previousIndex === -1
        ? nextBackends.length
        : Math.min(previousIndex, nextBackends.length),
      0,
      rollbackBackend,
    );
    didRollback = true;
    return nextBackends;
  });
  if (didRollback) toast.error(message);
}

export function ActiveBackendProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const persistenceAbortControllersRef = React.useRef(
    new Map<string, AbortController>(),
  );
  const backendPersistenceVersionsRef = React.useRef(new Map<string, number>());
  const lastPersistedCloudBackendsRef = React.useRef(
    new Map<string, Backend>(),
  );
  const pendingNewCloudBackendIdsRef = React.useRef(new Set<string>());
  const snapshot = React.useSyncExternalStore(
    subscribeActiveBackend,
    getSnapshot,
    getSnapshot,
  );

  const beginBackendPersistence = React.useCallback((id: string) => {
    persistenceAbortControllersRef.current.get(id)?.abort();
    const controller = new AbortController();
    const version = (backendPersistenceVersionsRef.current.get(id) ?? 0) + 1;
    backendPersistenceVersionsRef.current.set(id, version);
    persistenceAbortControllersRef.current.set(id, controller);
    return { controller, version };
  }, []);

  const clearBackendPersistence = React.useCallback(
    (id: string, controller: AbortController, version: number) => {
      if (persistenceAbortControllersRef.current.get(id) === controller) {
        persistenceAbortControllersRef.current.delete(id);
        if (backendPersistenceVersionsRef.current.get(id) === version) {
          backendPersistenceVersionsRef.current.delete(id);
        }
      }
    },
    [],
  );

  React.useEffect(() => {
    return () => {
      for (const controller of persistenceAbortControllersRef.current.values()) {
        controller.abort();
      }
      persistenceAbortControllersRef.current.clear();
      backendPersistenceVersionsRef.current.clear();
      lastPersistedCloudBackendsRef.current.clear();
      pendingNewCloudBackendIdsRef.current.clear();
    };
  }, []);

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
    (backend: Omit<Backend, "id">): Backend => {
      const next: Backend = { ...backend, id: generateId() };
      updateRegisteredBackends((previousBackends) => [
        ...previousBackends,
        next,
      ]);
      if (next.kind === "cloud" && next.apiKey.trim()) {
        pendingNewCloudBackendIdsRef.current.add(next.id);
      }
      const { controller, version } = beginBackendPersistence(next.id);
      void persistCloudBackendCredential(next, { signal: controller.signal })
        .then(() => {
          if (controller.signal.aborted) return;
          if (next.kind === "cloud") {
            lastPersistedCloudBackendsRef.current.set(next.id, next);
          }
        })
        .catch((error) => {
          if (isAbortError(error) || controller.signal.aborted) return;
          console.warn(
            `Failed to persist Cloud backend ${next.id} credentials locally`,
            error,
          );
          removeFailedNewBackend({
            backendId: next.id,
            message: CLOUD_BACKEND_PERSISTENCE_ERROR,
            pendingNewCloudBackendIds: pendingNewCloudBackendIdsRef.current,
          });
        })
        .finally(() => {
          removePendingNewBackendIfCurrent({
            backendPersistenceVersions: backendPersistenceVersionsRef.current,
            pendingNewCloudBackendIds: pendingNewCloudBackendIdsRef.current,
            backendId: next.id,
            operationVersion: version,
          });
          clearBackendPersistence(next.id, controller, version);
        });
      return next;
    },
    [beginBackendPersistence, clearBackendPersistence],
  );

  const updateBackend = React.useCallback(
    (id: string, patch: Partial<Omit<Backend, "id">>) => {
      let prev: Backend | undefined;
      const list = updateRegisteredBackends((previousBackends) => {
        prev = previousBackends.find((b) => b.id === id);
        return previousBackends.map((b) =>
          b.id === id ? { ...b, ...patch } : b,
        );
      });
      const next = list.find((b) => b.id === id);
      const rollbackBackend = prev
        ? getPersistedRollbackBackend(
            lastPersistedCloudBackendsRef.current,
            prev,
          )
        : null;
      if (next?.kind === "cloud" && next.apiKey.trim()) {
        const { controller, version } = beginBackendPersistence(id);
        void persistCloudBackendCredential(next, { signal: controller.signal })
          .then(() => {
            if (controller.signal.aborted) return;
            lastPersistedCloudBackendsRef.current.set(next.id, next);
          })
          .catch((error) => {
            if (isAbortError(error) || controller.signal.aborted) return;
            console.warn(
              `Failed to persist Cloud backend ${next.id} credentials locally`,
              error,
            );
            if (pendingNewCloudBackendIdsRef.current.has(id)) {
              removeFailedNewBackend({
                backendId: id,
                message: CLOUD_BACKEND_PERSISTENCE_ERROR,
                pendingNewCloudBackendIds: pendingNewCloudBackendIdsRef.current,
              });
            } else if (rollbackBackend) {
              restoreFailedBackendUpdate({
                backendPersistenceVersions:
                  backendPersistenceVersionsRef.current,
                backendId: id,
                operationVersion: version,
                rollbackBackend,
                message: CLOUD_BACKEND_PERSISTENCE_ERROR,
              });
            }
          })
          .finally(() => {
            removePendingNewBackendIfCurrent({
              backendPersistenceVersions: backendPersistenceVersionsRef.current,
              pendingNewCloudBackendIds: pendingNewCloudBackendIdsRef.current,
              backendId: id,
              operationVersion: version,
            });
            clearBackendPersistence(id, controller, version);
          });
      } else if (prev?.kind === "cloud") {
        const { controller, version } = beginBackendPersistence(id);
        void deleteCloudBackendCredential(id, { signal: controller.signal })
          .then(() => {
            if (controller.signal.aborted) return;
            lastPersistedCloudBackendsRef.current.delete(id);
          })
          .catch((error) => {
            if (isAbortError(error) || controller.signal.aborted) return;
            if (next && rollbackBackend) {
              restoreFailedBackendUpdate({
                backendPersistenceVersions:
                  backendPersistenceVersionsRef.current,
                backendId: id,
                operationVersion: version,
                rollbackBackend,
                message: CLOUD_BACKEND_DELETE_ERROR,
              });
            }
          })
          .finally(() => {
            clearBackendPersistence(id, controller, version);
          });
      } else {
        backendPersistenceVersionsRef.current.delete(id);
        lastPersistedCloudBackendsRef.current.delete(id);
      }

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
    },
    [beginBackendPersistence, clearBackendPersistence],
  );

  const removeBackend = React.useCallback(
    (id: string) => {
      let previousBackends: Backend[] = [];
      let prev: Backend | undefined;
      updateRegisteredBackends((currentBackends) => {
        previousBackends = currentBackends;
        prev = currentBackends.find((b) => b.id === id);
        return currentBackends.filter((b) => b.id !== id);
      });
      pendingNewCloudBackendIdsRef.current.delete(id);
      const removedBackend = prev;
      if (removedBackend?.kind === "cloud") {
        const { controller, version } = beginBackendPersistence(id);
        void deleteCloudBackendCredential(id, { signal: controller.signal })
          .then(() => {
            if (controller.signal.aborted) return;
            lastPersistedCloudBackendsRef.current.delete(id);
          })
          .catch((error) => {
            if (isAbortError(error) || controller.signal.aborted) return;
            restoreFailedBackendRemoval({
              backendPersistenceVersions: backendPersistenceVersionsRef.current,
              lastPersistedCloudBackends: lastPersistedCloudBackendsRef.current,
              previousBackends,
              removedBackend,
              operationVersion: version,
              message: CLOUD_BACKEND_DELETE_ERROR,
            });
          })
          .finally(() => {
            clearBackendPersistence(id, controller, version);
          });
      } else {
        backendPersistenceVersionsRef.current.delete(id);
        lastPersistedCloudBackendsRef.current.delete(id);
      }
      dropBackendHealth(id);
      // If the active selection pointed at this backend, the active
      // store falls back to the first remaining local backend (or the
      // env-derived default if no locals exist); consumer hooks re-key
      // by the new active backend identity and refetch automatically.
    },
    [beginBackendPersistence, clearBackendPersistence],
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
