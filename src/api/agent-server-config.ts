export const AGENT_SERVER_CONFIG_STORAGE_KEY = "openhands-agent-server-config";
export const DEFAULT_WORKING_DIR = "workspace/project";

/**
 * Key fetched at runtime from `/backends.json`. Written by the launcher
 * in local mode so the frontend can auto-authenticate without the user
 * pasting anything. In public mode the file contains `authRequired: true`
 * instead — signalling the user must enter the key manually.
 *
 * This value is populated once by {@link loadBackendsJson} and then used
 * as the highest-priority fallback in {@link getConfiguredSessionApiKey}.
 */
let runtimeApiKey: string | null = null;

/**
 * Set to `true` when `/backends.json` contains `authRequired: true`
 * (public mode). The frontend shows the key-entry screen when this is
 * true and no key has been configured yet.
 */
let authRequired = false;

/**
 * Whether {@link loadBackendsJson} has completed (regardless of result).
 * Used to avoid duplicate fetches.
 */
let backendsJsonLoaded = false;

interface BackendsJson {
  localBackendApiKey?: string;
  authRequired?: boolean;
}

/**
 * Fetch `/backends.json` (written by the launcher at startup) and cache
 * its contents. Safe to call multiple times — the fetch only happens
 * once. A 404 or network error is silently ignored (means we're running
 * standalone or in Vite dev mode with `VITE_SESSION_API_KEY`).
 *
 * The file can contain either:
 *   - `{ localBackendApiKey: "<key>" }` — local mode, auto-auth
 *   - `{ authRequired: true }` — public mode, user must paste key
 */
export async function loadBackendsJson(): Promise<void> {
  if (backendsJsonLoaded) return;
  backendsJsonLoaded = true;

  try {
    const res = await fetch("/backends.json");
    if (!res.ok) return;

    const data = (await res.json()) as BackendsJson;
    if (data?.localBackendApiKey) {
      runtimeApiKey = data.localBackendApiKey;
    }
    if (data?.authRequired) {
      authRequired = true;
    }
  } catch {
    // Not available — standalone frontend or dev with VITE_SESSION_API_KEY.
  }
}

/**
 * Returns the runtime API key loaded from `/backends.json`, or null if
 * the file was absent or hasn't been loaded yet.
 */
export function getRuntimeApiKey(): string | null {
  return runtimeApiKey;
}

/**
 * Returns true when the launcher declared this a public-mode deployment
 * (`/backends.json` contained `authRequired: true`).
 */
export function isAuthRequired(): boolean {
  return authRequired;
}

/**
 * Returns true when the launcher signalled that auth is required AND no
 * key has been configured yet (not in localStorage, not from
 * /backends.json, not from VITE_SESSION_API_KEY).
 */
export function isAuthRequiredAndMissing(): boolean {
  return authRequired && !getConfiguredSessionApiKey();
}

/**
 * Wipe the session API key from localStorage so the key-entry screen
 * re-appears on the next render cycle. Called when a stored key turns
 * out to be stale (server returns 401 in public mode).
 */
export function clearStoredSessionApiKey(): void {
  const current = readStoredConfig();
  writeStoredConfig({ ...current, sessionApiKey: null });
}

/**
 * When running in public mode (`authRequired`) and a stored session key
 * exists, probe an authenticated endpoint to check whether the key is
 * still valid. Returns `true` if the key is accepted, `false` if the
 * server returned 401 (key is stale). On 401, the stale key is
 * automatically cleared from localStorage.
 *
 * Callers can use this to decide whether to show the key-entry screen.
 */
export async function validateStoredSessionKey(): Promise<boolean> {
  const apiKey = getConfiguredSessionApiKey();
  if (!apiKey) return false;

  try {
    const res = await fetch("/api/settings", {
      headers: { "X-Session-API-Key": apiKey },
    });
    if (res.status === 401) {
      clearStoredSessionApiKey();
      return false;
    }
    return true;
  } catch {
    // Network error — assume valid, let the normal flow surface errors.
    return true;
  }
}

interface StoredAgentServerConfig {
  baseUrl?: string | null;
  sessionApiKey?: string | null;
  workingDir?: string | null;
}

export interface AgentServerFormDefaults {
  baseUrl: string;
  sessionApiKey: string;
}

function readStoredConfig(): StoredAgentServerConfig {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(AGENT_SERVER_CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredAgentServerConfig;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeStoredConfig(config: StoredAgentServerConfig): void {
  if (typeof window === "undefined") return;

  const nextConfig = Object.fromEntries(
    Object.entries(config).flatMap(([key, value]) => {
      if (typeof value !== "string") return [];

      const trimmed = value.trim();
      if (!trimmed) return [];

      return [[key, trimmed]];
    }),
  ) as StoredAgentServerConfig;

  if (Object.keys(nextConfig).length === 0) {
    window.localStorage.removeItem(AGENT_SERVER_CONFIG_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    AGENT_SERVER_CONFIG_STORAGE_KEY,
    JSON.stringify(nextConfig),
  );
}

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

function getConfiguredBaseUrl(): string | null {
  const storedUrl = normalizeBaseUrl(readStoredConfig().baseUrl);
  if (storedUrl) return storedUrl;

  return normalizeBaseUrl(import.meta.env.VITE_BACKEND_BASE_URL);
}

export function getConfiguredSessionApiKey(): string | null {
  // 1. User override from localStorage (highest priority — user explicitly
  //    pasted or configured this key)
  const storedKey = trimToNull(readStoredConfig().sessionApiKey);
  if (storedKey) return storedKey;

  // 2. Runtime key from /backends.json (written by local-mode launcher)
  if (runtimeApiKey) return runtimeApiKey;

  // 3. Build-time key from VITE_SESSION_API_KEY (dev mode)
  return trimToNull(import.meta.env.VITE_SESSION_API_KEY);
}

function shouldUseProxyOrigin(baseUrl: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const configuredUrl = new URL(baseUrl);
    const localHosts = new Set(["127.0.0.1", "localhost", "0.0.0.0"]);
    const browserHostname = window.location.hostname;

    return (
      localHosts.has(configuredUrl.hostname) && !localHosts.has(browserHostname)
    );
  } catch {
    return false;
  }
}

function resolveAgentServerBaseUrl(baseUrl: string | null): string | null {
  if (!baseUrl) {
    return null;
  }

  if (shouldUseProxyOrigin(baseUrl)) {
    return window.location.origin;
  }

  return baseUrl;
}

export function getAgentServerFormDefaults(): AgentServerFormDefaults {
  return {
    baseUrl: getConfiguredBaseUrl() ?? "",
    sessionApiKey: getConfiguredSessionApiKey() ?? "",
  };
}

export function saveAgentServerConfig(config: AgentServerFormDefaults): void {
  const currentConfig = readStoredConfig();

  writeStoredConfig({
    ...currentConfig,
    baseUrl: normalizeBaseUrl(config.baseUrl),
    sessionApiKey: trimToNull(config.sessionApiKey),
  });
}

export function getAgentServerBaseUrl(): string {
  const configuredUrl = resolveAgentServerBaseUrl(getConfiguredBaseUrl());
  if (configuredUrl) return configuredUrl;

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://127.0.0.1:8000";
}

export function getAgentServerSessionApiKey(): string | null {
  return getConfiguredSessionApiKey();
}

export function getAgentServerWorkingDir(): string {
  const envDir = import.meta.env.VITE_WORKING_DIR?.trim();
  if (envDir) return envDir;

  const storedDir = readStoredConfig().workingDir?.trim();
  if (storedDir) return storedDir;

  return DEFAULT_WORKING_DIR;
}

export function buildConversationWorkingDir(conversationId: string): string {
  const base = getAgentServerWorkingDir().replace(/\/+$/, "");
  const hex = conversationId.replace(/-/g, "");
  return `${base}/${hex}`;
}

export function getConfiguredWorkerUrls(): string[] {
  const raw = import.meta.env.VITE_WORKER_URLS?.trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((url: string) => normalizeBaseUrl(url))
    .filter((url: string | null): url is string => Boolean(url));
}

export function getAgentServerHeaders(): Record<string, string> {
  const sessionApiKey = getAgentServerSessionApiKey();
  return sessionApiKey ? { "X-Session-API-Key": sessionApiKey } : {};
}

/**
 * Returns whether public skills from the OpenHands extensions marketplace
 * (https://github.com/OpenHands/extensions) should be loaded.
 *
 * Defaults to false. Set VITE_LOAD_PUBLIC_SKILLS=true to enable.
 */
export function shouldLoadPublicSkills(): boolean {
  return import.meta.env.VITE_LOAD_PUBLIC_SKILLS === "true";
}
