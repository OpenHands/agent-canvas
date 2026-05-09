import { HttpError } from "@openhands/typescript-client/client/http-client";
import { getBundledBackend } from "#/api/backend-registry/bundled";
import {
  createServerClient,
  type ServerInfo as BaseServerInfo,
} from "#/api/typescript-client";

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

export async function loadAgentServerInfo() {
  // The probe is a *local* agent-server concern — it verifies the runtime
  // hosting the GUI is reachable. It must NEVER run against the active
  // backend, because cloud SaaS hosts don't expose /api/server_info and
  // would fail with a CORS error besides.
  const bundled = getBundledBackend();
  let serverInfo: AgentServerInfo;

  try {
    serverInfo = (await createServerClient({
      host: bundled.host,
      sessionApiKey: bundled.apiKey || null,
      timeout: AGENT_SERVER_INFO_TIMEOUT_MS,
    }).getServerInfo()) as AgentServerInfo;
  } catch (error) {
    clearCachedAgentServerInfo();
    if (error instanceof HttpError) {
      throw error;
    }

    const details = error instanceof Error ? error.message : null;
    throw new AgentServerUnavailableError(details);
  }

  cachedAgentServerInfo = serverInfo;
  return serverInfo;
}
