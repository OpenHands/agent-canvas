import {
  DEFAULT_LOCAL_BACKEND_ID,
  DEFAULT_LOCAL_BACKEND_NAME,
  makeDefaultLocalBackend,
} from "./default-backend";
import type { Backend, BackendKind, BackendSelection } from "./types";

export const BACKENDS_STORAGE_KEY = "openhands-backends";
export const ACTIVE_BACKEND_STORAGE_KEY = "openhands-active-backend";

const LEGACY_AGENT_SERVER_CONFIG_STORAGE_KEY = "openhands-agent-server-config";

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

function normalizeLegacyBaseUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function readLegacyBackend(): Backend | null {
  const raw = window.localStorage.getItem(
    LEGACY_AGENT_SERVER_CONFIG_STORAGE_KEY,
  );
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const host = normalizeLegacyBaseUrl(parsed.baseUrl);
    const apiKey =
      typeof parsed.sessionApiKey === "string"
        ? parsed.sessionApiKey.trim()
        : "";

    if (!host || !apiKey) return null;

    return {
      id: DEFAULT_LOCAL_BACKEND_ID,
      name: DEFAULT_LOCAL_BACKEND_NAME,
      host,
      apiKey,
      kind: "local",
    };
  } catch {
    return null;
  }
}

function clearLegacyBackendConfig(): void {
  window.localStorage.removeItem(LEGACY_AGENT_SERVER_CONFIG_STORAGE_KEY);
}

function seedBackends(backends: Backend[]): Backend[] {
  writeStoredBackends(backends);
  clearLegacyBackendConfig();
  return backends;
}

function isLoopbackUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function shouldSyncLauncherDefaultLocalBackend(
  backend: Backend,
  defaultBackend: Backend,
): boolean {
  if (backend.id !== DEFAULT_LOCAL_BACKEND_ID || backend.kind !== "local") {
    return false;
  }

  return (
    backend.host === defaultBackend.host ||
    (isLoopbackUrl(backend.host) && isLoopbackUrl(defaultBackend.host))
  );
}

function syncLauncherDefaultLocalBackend(backends: Backend[]): Backend[] {
  const defaultBackend = makeDefaultLocalBackend();
  if (!defaultBackend) return backends;

  let didSync = false;
  const syncedBackends = backends.map((backend) => {
    if (!shouldSyncLauncherDefaultLocalBackend(backend, defaultBackend)) {
      return backend;
    }

    if (backend.apiKey === defaultBackend.apiKey) return backend;

    didSync = true;
    return {
      ...backend,
      apiKey: defaultBackend.apiKey,
    };
  });

  if (!didSync) return backends;

  writeStoredBackends(syncedBackends);
  return syncedBackends;
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

    // First install: migrate one legacy local backend if present, otherwise
    // seed only when the launcher supplied enough information for a usable
    // local backend.
    if (raw === null) {
      const legacyBackend = readLegacyBackend();
      if (legacyBackend) return seedBackends([legacyBackend]);

      const defaultBackend = makeDefaultLocalBackend();
      if (!defaultBackend) return [];

      return seedBackends([defaultBackend]);
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(isValidBackend);

    // If the stored array is empty (or everything in it failed validation),
    // only re-seed when the launcher supplied both a host and API key.
    if (valid.length === 0) {
      const defaultBackend = makeDefaultLocalBackend();
      if (!defaultBackend) return [];

      return seedBackends([defaultBackend]);
    }

    const synced = syncLauncherDefaultLocalBackend(valid);
    clearLegacyBackendConfig();
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
