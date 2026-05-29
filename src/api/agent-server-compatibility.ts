import {
  ServerClient,
  SettingsClient,
} from "@openhands/typescript-client/clients";
import type { ServerInfo as BaseServerInfo } from "@openhands/typescript-client";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { isAuthRequired } from "#/api/agent-server-config";
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

/**
 * Returns true when the agent-server probe failed with HTTP 401.
 * In public mode this means the stored key is stale (server restarted
 * with a different `LOCAL_BACKEND_API_KEY`). Only meaningful when
 * auth is required — a 401 in local mode is a misconfiguration, not a
 * key-rotation event. Uses {@link isAuthRequired} so both the build-time
 * `VITE_AUTH_REQUIRED` flag and the runtime `window.__AGENT_CANVAS_AUTH_REQUIRED__`
 * injection (used by pre-built static binaries) are honoured.
 */
export const isAgentServerAuthError = (error: unknown): boolean =>
  isAuthRequired() && isSdkHttpStatusError(error, 401);

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

export function isSdkHttpError(error: unknown) {
  return (
    error instanceof Error &&
    error.name === "HttpError" &&
    "status" in error &&
    typeof error.status === "number"
  );
}

/**
 * Narrows an SDK HTTP error to a specific status code.
 * Use instead of manually casting `(err as { status: number }).status`.
 */
export function isSdkHttpStatusError(error: unknown, status: number): boolean {
  return (
    isSdkHttpError(error) && (error as { status: number }).status === status
  );
}

export async function loadAgentServerInfo() {
  // The probe is a *local* agent-server concern — it verifies the runtime
  // hosting the GUI is reachable. It must NEVER run against the active
  // backend when that backend is cloud, because cloud hosts don't
  // expose /api/server_info and would fail with a CORS error besides.
  const local = getEffectiveLocalBackend();
  const clientOptions = getAgentServerClientOptions({
    host: local.host,
    sessionApiKey: local.apiKey || null,
    timeout: AGENT_SERVER_INFO_TIMEOUT_MS,
  });
  let serverInfo: AgentServerInfo;

  try {
    serverInfo = (await new ServerClient(
      clientOptions,
    ).getServerInfo()) as AgentServerInfo;
  } catch (error) {
    clearCachedAgentServerInfo();
    if (isSdkHttpError(error)) {
      throw error;
    }

    const details = error instanceof Error ? error.message : null;
    throw new AgentServerUnavailableError(details);
  }

  // /server_info is unprotected, so a stale session key still gets 200.
  // In public mode, validate the key against a protected endpoint so a
  // server restart with a new LOCAL_BACKEND_API_KEY surfaces immediately
  // instead of letting the app load and fail on every subsequent call.
  if (isAuthRequired()) {
    try {
      await new SettingsClient(clientOptions).getSettings();
    } catch (error) {
      // Only rethrow 401 — that means the stored key is invalid /
      // rotated.  Other HTTP errors (403, 5xx) and non-HTTP errors
      // (network, timeout) are swallowed: the server *is* up (we just
      // reached /server_info), so let the app proceed with an
      // unvalidated key rather than blocking the UI.
      // NOTE: If the connection drops between the /server_info and
      // getSettings() probes, the app loads with an unvalidated key and
      // subsequent 401s won't trigger the auth screen (they come from
      // React Query hooks, not this bootstrap path). Acceptable for now
      // since the window is narrow and a page refresh recovers.
      if (isSdkHttpStatusError(error, 401)) {
        throw error;
      }

      console.warn(
        "[agent-server] getSettings() probe failed (non-401):",
        error,
      );
    }
  }

  cachedAgentServerInfo = serverInfo;
  return serverInfo;
}
