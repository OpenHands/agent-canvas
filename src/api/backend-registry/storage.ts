import { makeDefaultLocalBackend } from "./default-backend";
import { hasConfiguredAgentServerDefaults } from "../agent-server-config";
import type { Backend, BackendKind, BackendSelection } from "./types";

export const BACKENDS_STORAGE_KEY = "openhands-backends";
export const ACTIVE_BACKEND_STORAGE_KEY = "openhands-active-backend";
const LEGACY_FRONTEND_ONLY_DEV_BACKEND_URL = "http://127.0.0.1:8000";

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

function isCurrentBrowserOrigin(host: string): boolean {
  if (typeof window === "undefined") return false;
  return (
    normalizeHostForComparison(host) ===
    normalizeHostForComparison(window.location.origin)
  );
}

function syncDefaultLocalBackendConfig(backend: Backend): Backend {
  const defaultBackend = makeDefaultLocalBackend();

  if (backend.id !== defaultBackend.id || backend.kind !== "local") {
    return backend;
  }

  const matchesDefaultHost =
    normalizeHostForComparison(backend.host) ===
    normalizeHostForComparison(defaultBackend.host);
  const isLegacySameOriginSeed = isCurrentBrowserOrigin(backend.host);

  if (!matchesDefaultHost && !isLegacySameOriginSeed) {
    return backend;
  }

  return {
    ...backend,
    host: defaultBackend.host,
    apiKey: defaultBackend.apiKey || backend.apiKey,
  };
}

function shouldSeedDefaultLocalBackend(): boolean {
  return hasConfiguredAgentServerDefaults();
}

function isAutoSeededDefaultLocalBackend(backend: Backend): boolean {
  const defaultBackend = makeDefaultLocalBackend();

  if (
    backend.id !== defaultBackend.id ||
    backend.kind !== "local" ||
    backend.name !== defaultBackend.name ||
    backend.apiKey !== ""
  ) {
    return false;
  }

  const host = normalizeHostForComparison(backend.host);
  return (
    host === normalizeHostForComparison(defaultBackend.host) ||
    host === LEGACY_FRONTEND_ONLY_DEV_BACKEND_URL
  );
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

    // First install: only seed a default local backend when deployment
    // config actually provided backend defaults. Frontend-only dev should
    // start with an empty registry so no backend looks preconfigured.
    if (raw === null) {
      if (!shouldSeedDefaultLocalBackend()) return [];
      const seeded = [makeDefaultLocalBackend()];
      writeStoredBackends(seeded);
      return seeded;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(isValidBackend);

    // If the stored array is empty (or everything in it failed validation),
    // re-seed only when deployment config provided backend defaults.
    if (valid.length === 0) {
      if (!shouldSeedDefaultLocalBackend()) return [];
      const seeded = [makeDefaultLocalBackend()];
      writeStoredBackends(seeded);
      return seeded;
    }

    const configuredDefaults = shouldSeedDefaultLocalBackend();
    const filtered = configuredDefaults
      ? valid
      : valid.filter((backend) => !isAutoSeededDefaultLocalBackend(backend));
    const synced = filtered.map(syncDefaultLocalBackendConfig);
    if (
      synced.length !== valid.length ||
      synced.some((backend, index) => backend !== valid[index])
    ) {
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
