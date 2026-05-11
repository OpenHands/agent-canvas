import { buildHttpBaseUrl } from "#/utils/websocket-url";
import { getAgentServerWorkingDir } from "./agent-server-config";
import { getEffectiveLocalBackend } from "./backend-registry/active-store";

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

function resolveHost(overrides: AgentServerClientOverrides): string {
  if (overrides.host) return normalizeHost(overrides.host);
  if (overrides.conversationUrl)
    return normalizeHost(buildHttpBaseUrl(overrides.conversationUrl));
  return normalizeHost(getEffectiveLocalBackend().host);
}

export function getAgentServerClientOptions(
  overrides: AgentServerClientOverrides = {},
): AgentServerClientOptions {
  const backend = getEffectiveLocalBackend();
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
