import {
  ApiKeysClient,
  ConversationClient,
  FileClient,
  LLMMetadataClient,
  SecurityClient,
  ServerClient,
  SessionClient,
  SettingsClient,
  SharedClient,
  SkillsClient,
  VSCodeClient,
} from "@openhands/typescript-client/clients";
import { HttpClient } from "@openhands/typescript-client/client/http-client";
import { RemoteEventsList } from "@openhands/typescript-client/events/remote-events-list";
import { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";
import { buildHttpBaseUrl } from "#/utils/websocket-url";
import {
  getActiveBackend,
  getEffectiveLocalBackend,
} from "./backend-registry/active-store";
import { getAgentServerWorkingDir } from "./agent-server-config";

export type { ServerInfo } from "@openhands/typescript-client";

interface TypeScriptClientOverrides {
  host?: string;
  apiKey?: string | null;
  sessionApiKey?: string | null;
  workingDir?: string;
  conversationUrl?: string | null;
  timeout?: number;
}

interface ResolvedClientOptions {
  host: string;
  apiKey?: string;
  workingDir: string;
}

/**
 * Pick the backend whose host + API key the typescript-client should use
 * by default. The typescript-client clients (createHttpClient and friends)
 * speak the *local agent-server's* protocol — `X-Session-API-Key` auth and
 * paths like `/api/conversations`, `/api/skills`, etc. The cloud SaaS
 * exposes neither, so when the active backend is cloud, fall back to the
 * first registered local backend for these calls. Cloud-specific calls go
 * through `callCloudProxy` separately and never touch this resolver.
 */
function resolveDefaultBackend() {
  const active = getActiveBackend().backend;
  if (active.kind === "cloud") return getEffectiveLocalBackend();
  return active;
}

function resolveHost(overrides: TypeScriptClientOverrides): string {
  if (overrides.host) return overrides.host.replace(/\/$/, "");
  if (overrides.conversationUrl)
    return buildHttpBaseUrl(overrides.conversationUrl);
  return resolveDefaultBackend().host;
}

function resolveClientOptions(
  overrides: TypeScriptClientOverrides = {},
): ResolvedClientOptions {
  const backend = resolveDefaultBackend();

  const host = resolveHost(overrides);
  const apiKey =
    overrides.sessionApiKey ?? overrides.apiKey ?? backend.apiKey ?? undefined;

  return {
    host,
    ...(apiKey ? { apiKey } : {}),
    workingDir: overrides.workingDir ?? getAgentServerWorkingDir(),
  };
}

export function createServerClient(
  overrides?: TypeScriptClientOverrides,
): ServerClient {
  const { host, apiKey } = resolveClientOptions(overrides);
  return new ServerClient({
    host,
    ...(apiKey ? { apiKey } : {}),
    ...(overrides?.timeout ? { timeout: overrides.timeout } : {}),
  });
}

export function createConversationClient(
  overrides?: TypeScriptClientOverrides,
): ConversationClient {
  const { host, apiKey } = resolveClientOptions(overrides);
  return new ConversationClient({ host, ...(apiKey ? { apiKey } : {}) });
}

export function createFileClient(
  overrides?: TypeScriptClientOverrides,
): FileClient {
  const { host, apiKey } = resolveClientOptions(overrides);
  return new FileClient({ host, ...(apiKey ? { apiKey } : {}) });
}

export function createSecurityClient(
  overrides?: TypeScriptClientOverrides,
): SecurityClient {
  const { host, apiKey } = resolveClientOptions(overrides);
  return new SecurityClient({ host, ...(apiKey ? { apiKey } : {}) });
}

export function createApiKeysClient(
  overrides?: TypeScriptClientOverrides,
): ApiKeysClient {
  const { host, apiKey } = resolveClientOptions(overrides);
  return new ApiKeysClient({ host, ...(apiKey ? { apiKey } : {}) });
}

export function createSessionClient(
  overrides?: TypeScriptClientOverrides,
): SessionClient {
  const { host, apiKey } = resolveClientOptions(overrides);
  return new SessionClient({ host, ...(apiKey ? { apiKey } : {}) });
}

export function createSharedClient(
  overrides?: TypeScriptClientOverrides,
): SharedClient {
  const { host, apiKey } = resolveClientOptions(overrides);
  return new SharedClient({ host, ...(apiKey ? { apiKey } : {}) });
}

export function createLlmMetadataClient(
  overrides?: TypeScriptClientOverrides,
): LLMMetadataClient {
  const { host, apiKey } = resolveClientOptions(overrides);
  return new LLMMetadataClient({ host, ...(apiKey ? { apiKey } : {}) });
}

export function createSettingsClient(
  overrides?: TypeScriptClientOverrides,
): SettingsClient {
  const { host, apiKey } = resolveClientOptions(overrides);
  return new SettingsClient({ host, ...(apiKey ? { apiKey } : {}) });
}

export function createSkillsClient(
  overrides?: TypeScriptClientOverrides,
): SkillsClient {
  const { host, apiKey } = resolveClientOptions(overrides);
  return new SkillsClient({ host, ...(apiKey ? { apiKey } : {}) });
}

export function createVSCodeClient(
  overrides?: TypeScriptClientOverrides,
): VSCodeClient {
  const { host, apiKey } = resolveClientOptions(overrides);
  return new VSCodeClient({ host, ...(apiKey ? { apiKey } : {}) });
}

export function createHttpClient(
  overrides?: TypeScriptClientOverrides,
): HttpClient {
  const { host, apiKey } = resolveClientOptions(overrides);
  return new HttpClient({
    baseUrl: host,
    ...(apiKey ? { apiKey } : {}),
    timeout: 60000,
  });
}

export function createRemoteEventsList(
  conversationId: string,
  overrides?: TypeScriptClientOverrides,
): RemoteEventsList {
  return new RemoteEventsList(createHttpClient(overrides), conversationId);
}

export function createRemoteWorkspace(
  overrides?: TypeScriptClientOverrides,
): RemoteWorkspace {
  const { host, apiKey, workingDir } = resolveClientOptions(overrides);
  return new RemoteWorkspace({
    host,
    workingDir,
    ...(apiKey ? { apiKey } : {}),
  });
}
