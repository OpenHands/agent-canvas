export const DEFAULT_WORKING_DIR = "workspace/project";

export interface AgentServerFormDefaults {
  baseUrl: string;
  sessionApiKey: string;
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
  return normalizeBaseUrl(import.meta.env.VITE_BACKEND_BASE_URL);
}

export function getBakedSessionApiKey(): string | null {
  return trimToNull(import.meta.env.VITE_SESSION_API_KEY);
}

export function getAgentServerFormDefaults(): AgentServerFormDefaults {
  return {
    baseUrl: getAgentServerBaseUrl() ?? "",
    sessionApiKey: getAgentServerSessionApiKey() ?? "",
  };
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

export function shouldLoadPublicSkills(): boolean {
  return import.meta.env.VITE_LOAD_PUBLIC_SKILLS !== "false";
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
