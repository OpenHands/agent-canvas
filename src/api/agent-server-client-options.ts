import { buildHttpBaseUrl } from "#/utils/websocket-url";
import {
  getAgentServerSessionApiKey,
  getAgentServerWorkingDir,
} from "./agent-server-config";
import { getEffectiveLocalBackend } from "./backend-registry/active-store";
import { DEFAULT_LOCAL_BACKEND_ID } from "./backend-registry/default-backend";
import type { Backend } from "./backend-registry/types";

export interface AgentServerClientOverrides {
  host?: string;
  apiKey?: string | null;
  sessionApiKey?: string | null;
  workingDir?: string;
  conversationUrl?: string | null;
  timeout?: number;
}

export interface AgentServerClientOptions {
  host: string;
  apiKey?: string;
  workingDir: string;
  timeout?: number;
}

function normalizeHost(host: string): string {
  return host.replace(/\/+$/, "");
}

function resolveHost(
  overrides: AgentServerClientOverrides,
  backend: Backend,
): string {
  if (overrides.host) return normalizeHost(overrides.host);
  if (overrides.conversationUrl)
    return normalizeHost(buildHttpBaseUrl(overrides.conversationUrl));
  return normalizeHost(backend.host);
}

export function getAgentServerClientOptions(
  overrides: AgentServerClientOverrides = {},
): AgentServerClientOptions {
  const backend = getEffectiveLocalBackend();
  const configuredSessionApiKey = getAgentServerSessionApiKey();
  const defaultLocalApiKeyOverride =
    backend.id === DEFAULT_LOCAL_BACKEND_ID ? configuredSessionApiKey : null;
  const apiKey =
    overrides.sessionApiKey ??
    overrides.apiKey ??
    defaultLocalApiKeyOverride ??
    backend.apiKey ??
    undefined;

  return {
    host: resolveHost(overrides, backend),
    ...(apiKey ? { apiKey } : {}),
    workingDir: overrides.workingDir ?? getAgentServerWorkingDir(),
    ...(overrides.timeout !== undefined ? { timeout: overrides.timeout } : {}),
  };
}

export function getAgentServerHttpClientOptions(
  overrides?: AgentServerClientOverrides,
) {
  const { host, apiKey, timeout } = getAgentServerClientOptions(overrides);
  return {
    baseUrl: host,
    ...(apiKey ? { apiKey } : {}),
    timeout: timeout ?? 60000,
  };
}
