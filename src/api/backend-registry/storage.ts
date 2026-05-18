import { makeDefaultLocalBackend } from "./default-backend";
import type { Backend, BackendKind, BackendSelection } from "./types";

export const BACKENDS_STORAGE_KEY = "openhands-backends";
export const ACTIVE_BACKEND_STORAGE_KEY = "openhands-active-backend";

function isValidKind(value: unknown): value is BackendKind {
  return value === "local" || value === "cloud";
}

function isValidBackend(value: unknown): value is Backend {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<Backend>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.name === "string" &&
    typeof v.host === "string" &&
    typeof v.apiKey === "string" &&
    isValidKind(v.kind)
  );
}

function normalizeHostForComparison(host: string): string {
  try {
    return new URL(host).origin;
  } catch {
    return host.replace(/\/+$/, "");
  }
}

/**
 * Sync the API key of the default local backend with the environment-provided
 * value. This ensures that if the session key changes (e.g., regenerated on
 * a fresh dev stack start), the stored backend entry picks up the new key
 * instead of keeping a stale one that causes 401 errors.
 *
 * We only sync when:
 *   - The backend is the default local backend (matching id)
 *   - The hosts match (so we don't overwrite a user-customized local backend
 *     that happens to share the same id but points elsewhere)
 *   - The environment provides an API key (nothing to sync otherwise)
 *
 * When these conditions are met, we always use the environment key because
 * the dev launcher is authoritative — it determines what key the agent-server
 * was started with.
 */
function syncDefaultLocalBackendAuth(backend: Backend): Backend {
  const defaultBackend = makeDefaultLocalBackend();

  // Only sync the default local backend
  if (backend.id !== defaultBackend.id || backend.kind !== "local") {
    return backend;
  }

  // Only sync if the environment provides an API key
  if (!defaultBackend.apiKey) {
    return backend;
  }

  // Only sync if the hosts match (origin comparison to ignore trailing slashes)
  if (
    normalizeHostForComparison(backend.host) !==
    normalizeHostForComparison(defaultBackend.host)
  ) {
    return backend;
  }

  // Sync the API key from the environment (even if the stored one differs)
  if (backend.apiKey === defaultBackend.apiKey) {
    return backend; // Already in sync
  }

  return {
    ...backend,
    apiKey: defaultBackend.apiKey,
  };
}

export function writeStoredBackends(backends: Backend[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BACKENDS_STORAGE_KEY, JSON.stringify(backends));
  } catch {
    /* ignore quota / serialization errors */
  }
}

export function readStoredBackends(): Backend[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BACKENDS_STORAGE_KEY);

    // First install: the storage key has never been written. Seed the
    // registry with one default local backend derived from the env /
    // agent-server-config so the user has something to talk to out of
    // the box.
    if (raw === null) {
      const seeded = [makeDefaultLocalBackend()];
      writeStoredBackends(seeded);
      return seeded;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(isValidBackend);

    // If the stored array is empty (or everything in it failed validation),
    // re-seed with the default Local backend so the user always has a
    // working entry pointing at VITE_SESSION_API_KEY. With the dev scripts
    // persisting that key to ~/.openhands/agent-canvas/session-api-key.txt,
    // re-seeding is safe — the seeded entry will keep working across
    // restarts instead of going stale.
    if (valid.length === 0) {
      const seeded = [makeDefaultLocalBackend()];
      writeStoredBackends(seeded);
      return seeded;
    }

    const synced = valid.map(syncDefaultLocalBackendAuth);
    if (synced.some((backend, index) => backend !== valid[index])) {
      writeStoredBackends(synced);
    }

    return synced;
  } catch {
    return [];
  }
}

export function readStoredActiveBackend(): BackendSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_BACKEND_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as BackendSelection).backendId !== "string"
    ) {
      return null;
    }
    const orgIdRaw = (parsed as BackendSelection).orgId;
    return {
      backendId: (parsed as BackendSelection).backendId,
      orgId:
        typeof orgIdRaw === "string" && orgIdRaw.length > 0 ? orgIdRaw : null,
    };
  } catch {
    return null;
  }
}

export function writeStoredActiveBackend(
  selection: BackendSelection | null,
): void {
  if (typeof window === "undefined") return;
  try {
    if (!selection) {
      window.localStorage.removeItem(ACTIVE_BACKEND_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      ACTIVE_BACKEND_STORAGE_KEY,
      JSON.stringify({
        backendId: selection.backendId,
        orgId: selection.orgId ?? null,
      }),
    );
  } catch {
    /* ignore */
  }
}
