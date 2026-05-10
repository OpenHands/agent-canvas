import { buildHttpBaseUrl } from "#/utils/websocket-url";
import { getAgentServerWorkingDir } from "./agent-server-config";
import {
  getActiveBackend,
  getEffectiveLocalBackend,
} from "./backend-registry/active-store";

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

function resolveDefaultBackend() {
  const active = getActiveBackend().backend;
  if (active.kind === "cloud") return getEffectiveLocalBackend();
  return active;
}

function resolveHost(overrides: AgentServerClientOverrides): string {
  if (overrides.host) return overrides.host.replace(/\/$/, "");
  if (overrides.conversationUrl)
    return buildHttpBaseUrl(overrides.conversationUrl);
  return resolveDefaultBackend().host;
}

export function getAgentServerClientOptions(
  overrides: AgentServerClientOverrides = {},
): AgentServerClientOptions {
  const backend = resolveDefaultBackend();
  const apiKey =
    overrides.sessionApiKey ?? overrides.apiKey ?? backend.apiKey ?? undefined;

  return {
    host: resolveHost(overrides),
    ...(apiKey ? { apiKey } : {}),
    workingDir: overrides.workingDir ?? getAgentServerWorkingDir(),
    ...(overrides.timeout ? { timeout: overrides.timeout } : {}),
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
