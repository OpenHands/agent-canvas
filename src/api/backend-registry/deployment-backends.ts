import type { Backend, BackendKind } from "./types";

/**
 * Backends supplied by the deployment host (not by an individual browser).
 *
 * A self-hosted Agent Canvas instance can advertise a fixed set of backends
 * so that every browser which loads the app sees the same fleet without each
 * user having to re-add them by hand. This is the multi-user / multi-device
 * counterpart to the per-browser `openhands-backends` localStorage registry:
 * deployment defaults are merged into that registry on read (see
 * `readStoredBackends`).
 *
 * Two sources are consulted, in order (matching `getBakedSessionApiKey`):
 *   1. `import.meta.env.VITE_DEFAULT_BACKENDS` — a JSON array baked into the
 *      bundle at build time (handy for `npm run dev`).
 *   2. `window.__AGENT_CANVAS_DEFAULT_BACKENDS__` — injected into `index.html`
 *      at serve time by `scripts/static-server.mjs --default-backends <json>`.
 *      This is the path used by the published binary / Docker image, where the
 *      bundle ships with an empty `VITE_DEFAULT_BACKENDS`.
 */
const DEPLOYMENT_BACKEND_ID_PREFIX = "deployment:";

function isValidKind(value: unknown): value is BackendKind {
  return value === "local" || value === "cloud";
}

function normalizeHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

/**
 * Coerce a loosely-typed config entry into a `Backend`. Only `host` and
 * `apiKey` are required; `name` defaults to the host, `kind` to `"local"`,
 * and `id` to a stable host-derived value so repeated merges are idempotent
 * and the same backend gets the same id across browsers.
 */
function coerceBackend(value: unknown): Backend | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;

  const host = normalizeHost(v.host);
  const apiKey = typeof v.apiKey === "string" ? v.apiKey.trim() : "";
  if (!host || !apiKey) return null;

  const name =
    typeof v.name === "string" && v.name.trim() ? v.name.trim() : host;
  const kind = isValidKind(v.kind) ? v.kind : "local";
  const id =
    typeof v.id === "string" && v.id.trim()
      ? v.id.trim()
      : `${DEPLOYMENT_BACKEND_ID_PREFIX}${host}`;

  return { id, name, host, apiKey, kind };
}

function parseBackendList(raw: unknown): Backend[] {
  let source: unknown = raw;

  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) return [];
    try {
      source = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(source)) return [];

  const result: Backend[] = [];
  const seenHosts = new Set<string>();
  for (const entry of source) {
    const backend = coerceBackend(entry);
    if (backend && !seenHosts.has(backend.host)) {
      seenHosts.add(backend.host);
      result.push(backend);
    }
  }
  return result;
}

/**
 * Return the deployment-provided default backends, de-duplicated by host.
 * Returns an empty array when the deployment did not configure any.
 */
export function getDeploymentDefaultBackends(): Backend[] {
  const fromEnv = parseBackendList(import.meta.env.VITE_DEFAULT_BACKENDS);
  if (fromEnv.length > 0) return fromEnv;

  if (typeof window !== "undefined") {
    const injected = (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_DEFAULT_BACKENDS__;
    return parseBackendList(injected);
  }

  return [];
}
