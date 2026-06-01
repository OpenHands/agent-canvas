export const AGENT_SERVER_CONFIG_STORAGE_KEY = "openhands-agent-server-config";
export const DEFAULT_WORKING_DIR = "workspace/project";

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

function getConfiguredSessionApiKey(): string | null {
  const storedKey = trimToNull(readStoredConfig().sessionApiKey);
  if (storedKey) return storedKey;

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
      localHosts.has(configuredUrl.hostname) &&
      (!localHosts.has(browserHostname) ||
        configuredUrl.hostname !== browserHostname)
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
 * Defaults to true. Set VITE_LOAD_PUBLIC_SKILLS=false to disable.
 */
export function shouldLoadPublicSkills(): boolean {
  return import.meta.env.VITE_LOAD_PUBLIC_SKILLS !== "false";
}
