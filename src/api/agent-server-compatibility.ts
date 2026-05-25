import { ServerClient } from "@openhands/typescript-client/clients";
import type { ServerInfo as BaseServerInfo } from "@openhands/typescript-client";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { getEffectiveLocalBackend } from "#/api/backend-registry/active-store";

const AGENT_SERVER_INFO_TIMEOUT_MS = 5000;

export interface AgentServerInfo extends BaseServerInfo {
  usable_tools?: string[] | null;
}

let cachedAgentServerInfo: AgentServerInfo | null = null;

const getAdvertisedTools = (serverInfo: AgentServerInfo | null) => {
  if (Array.isArray(serverInfo?.usable_tools)) {
    return serverInfo.usable_tools;
  }
  return null;
};

export class AgentServerUnavailableError extends Error {
  readonly details: string | null;

  constructor(details?: string | null) {
    super(
      "Agent server not found. Could not connect to the configured agent server. Start a compatible agent server and reload the page.",
    );
    this.name = "AgentServerUnavailableError";
    this.details = details ?? null;
  }
}

export const isAgentServerUnavailableError = (
  error: unknown,
): error is AgentServerUnavailableError =>
  error instanceof AgentServerUnavailableError ||
  (typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AgentServerUnavailableError");

export function clearCachedAgentServerInfo() {
  cachedAgentServerInfo = null;
}

export function isAgentServerToolAvailable(toolName: string) {
  const availableTools = getAdvertisedTools(cachedAgentServerInfo);
  if (!Array.isArray(availableTools)) {
    return true;
  }
  return availableTools.includes(toolName);
}

function isSdkHttpError(error: unknown) {
  return (
    error instanceof Error &&
    error.name === "HttpError" &&
    "status" in error &&
    typeof error.status === "number"
  );
}

export async function loadAgentServerInfo() {
  // The probe is a *local* agent-server concern — it verifies the runtime
  // hosting the GUI is reachable. It must NEVER run against the active
  // backend when that backend is cloud, because cloud hosts don't
  // expose /api/server_info and would fail with a CORS error besides.
  const local = getEffectiveLocalBackend();
  let serverInfo: AgentServerInfo;

  try {
    serverInfo = (await new ServerClient(
      getAgentServerClientOptions({
        host: local.host,
        sessionApiKey: local.apiKey || null,
        timeout: AGENT_SERVER_INFO_TIMEOUT_MS,
      }),
    ).getServerInfo()) as AgentServerInfo;
  } catch (error) {
    clearCachedAgentServerInfo();
    if (isSdkHttpError(error)) {
      throw error;
    }

    const details = error instanceof Error ? error.message : null;
    throw new AgentServerUnavailableError(details);
  }

  cachedAgentServerInfo = serverInfo;
  return serverInfo;
}
