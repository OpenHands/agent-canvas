import { getAgentServerSessionApiKey } from "../agent-server-config";
import { makeDefaultLocalBackend } from "./default-backend";
import type { Backend, BackendKind, BackendSelection } from "./types";

export const BACKENDS_STORAGE_KEY = "openhands-backends";
export const ACTIVE_BACKEND_STORAGE_KEY = "openhands-active-backend";

/**
 * Stable id for the Docker backend that the dev launcher auto-registers
 * when started with `--with-docker` or via the interactive prompt.
 */
export const DOCKER_BACKEND_ID = "docker-backend";

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

function syncDefaultLocalBackendAuth(backend: Backend): Backend {
  const defaultBackend = makeDefaultLocalBackend();

  if (
    backend.id !== defaultBackend.id ||
    backend.kind !== "local" ||
    !defaultBackend.apiKey ||
    normalizeHostForComparison(backend.host) !==
      normalizeHostForComparison(defaultBackend.host)
  ) {
    return backend;
  }

  if (backend.apiKey === defaultBackend.apiKey) {
    return backend;
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

/**
 * If VITE_DOCKER_BACKEND_HOST is set (by `dev-with-automation --with-docker`),
 * construct a Docker backend entry. Returns null when not configured.
 */
function getDockerBackendFromEnv(): Backend | null {
  const host = import.meta.env.VITE_DOCKER_BACKEND_HOST?.trim();
  if (!host) return null;

  return {
    id: DOCKER_BACKEND_ID,
    name: "Docker",
    host,
    apiKey: getAgentServerSessionApiKey() ?? "",
    kind: "local",
  };
}

/**
 * Ensure the Docker backend is present (or removed) in the backends list
 * based on whether VITE_DOCKER_BACKEND_HOST is currently set. Returns
 * a new array and a boolean indicating whether it was mutated.
 */
function syncDockerBackend(backends: Backend[]): {
  backends: Backend[];
  changed: boolean;
} {
  const dockerEnv = getDockerBackendFromEnv();
  const existingIdx = backends.findIndex((b) => b.id === DOCKER_BACKEND_ID);

  if (dockerEnv) {
    // Docker is configured — ensure the entry exists and is up-to-date.
    if (existingIdx >= 0) {
      const existing = backends[existingIdx];
      if (
        normalizeHostForComparison(existing.host) ===
          normalizeHostForComparison(dockerEnv.host) &&
        existing.apiKey === dockerEnv.apiKey
      ) {
        return { backends, changed: false };
      }
      const updated = [...backends];
      updated[existingIdx] = dockerEnv;
      return { backends: updated, changed: true };
    }
    return { backends: [...backends, dockerEnv], changed: true };
  }

  // Docker is not configured — remove stale entry if present.
  if (existingIdx >= 0) {
    const updated = backends.filter((_, i) => i !== existingIdx);
    return { backends: updated, changed: true };
  }
  return { backends, changed: false };
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
      const { backends: withDocker } = syncDockerBackend(seeded);
      writeStoredBackends(withDocker);
      return withDocker;
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
      const { backends: withDocker } = syncDockerBackend(seeded);
      writeStoredBackends(withDocker);
      return withDocker;
    }

    let synced = valid.map(syncDefaultLocalBackendAuth);
    let changed = synced.some((backend, index) => backend !== valid[index]);

    // Sync Docker backend from VITE_DOCKER_BACKEND_HOST
    const dockerResult = syncDockerBackend(synced);
    if (dockerResult.changed) {
      synced = dockerResult.backends;
      changed = true;
    }

    if (changed) {
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
