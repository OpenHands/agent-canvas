export const DEFAULT_WORKING_DIR = "workspace/project";

/**
 * Default root the agent-server clones GitHub repositories into (and creates
 * per-task worktrees beneath). It deliberately lives under the writable,
 * persisted `.openhands` state volume rather than the legacy `/projects` bind
 * mount: the in-container `openhands` user owns `.openhands`, whereas a
 * host-mounted `/projects` is owned by the host user (UID mismatch on Linux,
 * macOS file-sharing restrictions for `~/Documents`), which made `git clone`
 * fail with "could not create work tree dir … Permission denied".
 */
export const DEFAULT_MANAGED_REPOSITORY_ROOT =
  "/home/openhands/.openhands/repos";

export interface AgentServerFormDefaults {
  baseUrl: string;
  sessionApiKey: string;
}

// Window-global key the static server injects `--lock-to-cloud` into; kept
// module-private because only `getLockedCloudHost()` reads it. The static
// server (`scripts/static-server.mjs`) and its tests reference the literal
// string directly, not this constant.
const LOCK_TO_CLOUD_WINDOW_KEY = "__AGENT_CANVAS_LOCK_TO_CLOUD__";

function trimToNull(value?: string | null): string | null {
  return value?.trim() || null;
}

function normalizeBaseUrl(value?: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${trimmed}`;
  }

  return `http://${trimmed}`;
}

function normalizeCloudHost(value?: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function getConfiguredBaseUrl(): string | null {
  return normalizeBaseUrl(import.meta.env.VITE_BACKEND_BASE_URL);
}

/**
 * Return the session API key supplied by the deployment host.
 *
 * Two sources are consulted, in order:
 *   1. `VITE_SESSION_API_KEY` — baked into the bundle at build time (used by
 *      `npm run dev` so the dev server has the key without a round-trip).
 *   2. `window.__AGENT_CANVAS_SESSION_API_KEY__` — injected into `index.html`
 *      at serve time by `scripts/static-server.mjs --session-api-key <key>`.
 *      This is the path used by the published `agent-canvas` binary, where
 *      `VITE_SESSION_API_KEY` is empty in the prebuilt bundle and the
 *      runtime key is generated when the user launches the CLI.
 *
 * Without the window-global fallback, the published binary cannot construct a
 * default local backend (`makeDefaultLocalBackend()` returns null), the
 * registry is left empty, and the user sees the Manage Backends modal
 * instead of the onboarding flow.
 */
export function getBakedSessionApiKey(): string | null {
  const envKey = trimToNull(import.meta.env.VITE_SESSION_API_KEY);
  if (envKey) return envKey;

  if (typeof window !== "undefined") {
    const injected = (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_SESSION_API_KEY__;
    if (typeof injected === "string") {
      return trimToNull(injected);
    }
  }

  return null;
}

export function getAgentServerFormDefaults(): AgentServerFormDefaults {
  return {
    baseUrl: getAgentServerBaseUrl() ?? "",
    sessionApiKey: getAgentServerSessionApiKey() ?? "",
  };
}

export function getLockedCloudHost(): string | null {
  const envHost = normalizeCloudHost(import.meta.env.VITE_LOCK_TO_CLOUD);
  if (envHost) return envHost;

  if (typeof window !== "undefined") {
    const injected = (window as unknown as Record<string, unknown>)[
      LOCK_TO_CLOUD_WINDOW_KEY
    ];
    if (typeof injected === "string") {
      return normalizeCloudHost(injected);
    }
  }

  return null;
}

/**
 * Compare a backend host against the locked Cloud host, normalizing
 * trailing slashes, protocol, and case so that e.g.
 * `https://app.all-hands.dev/` matches `https://app.all-hands.dev`.
 *
 * Used by the locked-to-Cloud gates (`root.tsx`,
 * `onboarding-modal.tsx`) to decide whether the active backend is the
 * configured locked Cloud host — a Cloud backend on a *different* host
 * (or a stale Local backend) must not be treated as the locked backend.
 */
export function isSameCloudHost(
  host: string | null | undefined,
  lockedHost: string | null | undefined,
): boolean {
  const a = normalizeCloudHost(host);
  const b = normalizeCloudHost(lockedHost);
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function getAgentServerBaseUrl(): string | null {
  const configuredUrl = getConfiguredBaseUrl();
  if (configuredUrl) return configuredUrl;

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return null;
}

export function getAgentServerSessionApiKey(): string | null {
  return getBakedSessionApiKey();
}

export function getAgentServerWorkingDir(): string {
  const envDir = import.meta.env.VITE_WORKING_DIR?.trim();
  if (envDir) return envDir;

  return DEFAULT_WORKING_DIR;
}

/**
 * Root directory the agent-server uses for managed GitHub clones / worktree
 * sources. Overridable at build time via `VITE_MANAGED_REPOSITORY_ROOT`;
 * defaults to a writable location under the `.openhands` state volume.
 */
export function getManagedRepositoryRoot(): string {
  const envRoot = import.meta.env.VITE_MANAGED_REPOSITORY_ROOT?.trim();
  if (envRoot) return envRoot.replace(/\/+$/, "");

  return DEFAULT_MANAGED_REPOSITORY_ROOT;
}

export function buildConversationWorkingDir(conversationId: string): string {
  const base = getAgentServerWorkingDir().replace(/\/+$/, "");
  const hex = conversationId.replace(/-/g, "");
  return `${base}/${hex}`;
}

export function getAgentServerHeaders(): Record<string, string> {
  const sessionApiKey = getAgentServerSessionApiKey();
  return sessionApiKey ? { "X-Session-API-Key": sessionApiKey } : {};
}

export function isAuthRequired(): boolean {
  return (
    import.meta.env.VITE_AUTH_REQUIRED === "true" ||
    (typeof window !== "undefined" &&
      (window as unknown as Record<string, unknown>)
        .__AGENT_CANVAS_AUTH_REQUIRED__ === true)
  );
}

export function isAuthRequiredAndMissing(): boolean {
  if (!isAuthRequired()) return false;
  return !getAgentServerSessionApiKey();
}
