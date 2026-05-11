import {
  LLMMetadataClient,
  ServerClient,
  SettingsClient,
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

interface GitRefOptions {
  ref?: string;
}

type RemoteGitChanges = Awaited<ReturnType<RemoteWorkspace["gitChanges"]>>;
type RemoteGitDiff = Awaited<ReturnType<RemoteWorkspace["gitDiff"]>>;

export type AgentCanvasRemoteWorkspace = Omit<
  RemoteWorkspace,
  "gitChanges" | "gitDiff"
> & {
  startWorkspaceSession(conversationId: string): Promise<string>;
  gitChanges(
    path: string,
    options?: GitRefOptions,
  ): ReturnType<RemoteWorkspace["gitChanges"]>;
  gitDiff(
    path: string,
    options?: GitRefOptions,
  ): ReturnType<RemoteWorkspace["gitDiff"]>;
};

function assertNonEmptyString(name: string, value: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }
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
): AgentCanvasRemoteWorkspace {
  const { host, apiKey, workingDir } = resolveClientOptions(overrides);
  const baseWorkspace = new RemoteWorkspace({
    host,
    workingDir,
    ...(apiKey ? { apiKey } : {}),
  });

  const workspaceExtensions = {
    startWorkspaceSession: async (conversationId: string) => {
      assertNonEmptyString("conversationId", conversationId);

      const response = await baseWorkspace.client.post<string>(
        "/api/auth/workspace-session",
        { conversation_id: conversationId },
      );

      return response.data;
    },
    gitChanges: async (path: string, options?: GitRefOptions) => {
      assertNonEmptyString("path", path);
      if (options?.ref !== undefined) {
        assertNonEmptyString("ref", options.ref);
      }

      const response = await baseWorkspace.client.get<RemoteGitChanges>(
        "/api/git/changes",
        {
          params: {
            path,
            ...(options?.ref !== undefined ? { ref: options.ref } : {}),
          },
        },
      );
      return response.data;
    },
    gitDiff: async (path: string, options?: GitRefOptions) => {
      assertNonEmptyString("path", path);
      if (options?.ref !== undefined) {
        assertNonEmptyString("ref", options.ref);
      }

      const response = await baseWorkspace.client.get<RemoteGitDiff>(
        "/api/git/diff",
        {
          params: {
            path,
            ...(options?.ref !== undefined ? { ref: options.ref } : {}),
          },
        },
      );
      return response.data;
    },
  } satisfies Pick<
    AgentCanvasRemoteWorkspace,
    "startWorkspaceSession" | "gitChanges" | "gitDiff"
  >;

  return Object.assign(baseWorkspace, workspaceExtensions);
}
