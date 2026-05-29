import {
  ServerClient,
  SettingsClient,
} from "@openhands/typescript-client/clients";
import type { ServerInfo as BaseServerInfo } from "@openhands/typescript-client";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import {
  getEffectiveLocalBackend,
  hasEffectiveLocalBackend,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { maybeCreateAgentServerCorsError } from "#/utils/agent-server-cors-error";

const AGENT_SERVER_INFO_TIMEOUT_MS = 5000;
const MAX_AGENT_SERVER_ERROR_DETAIL_LENGTH = 240;
const HTML_DOCUMENT_RESPONSE_DETAIL =
  "The server returned an HTML page instead of an agent-server API response.";

export interface AgentServerInfo extends BaseServerInfo {
  usable_tools?: string[] | null;
}

export type AgentServerUnavailableReason = "unauthorized" | "unreachable";

let cachedAgentServerInfo: AgentServerInfo | null = null;

const getAdvertisedTools = (serverInfo: AgentServerInfo | null) => {
  if (Array.isArray(serverInfo?.usable_tools)) {
    return serverInfo.usable_tools;
  }
  return null;
};

export class AgentServerUnavailableError extends Error {
  readonly details: string | null;
  readonly reason: AgentServerUnavailableReason;
  readonly status: number | null;

  constructor(
    details?: string | null,
    reason: AgentServerUnavailableReason = "unreachable",
    status?: number | null,
  ) {
    super(
      "Agent server not found. Could not connect to the configured agent server. Start a compatible agent server and reload the page.",
    );
    this.name = "AgentServerUnavailableError";
    this.details = details ?? null;
    this.reason = reason;
    this.status = status ?? null;
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

function isSdkHttpError(error: unknown): error is Error & { status: number } {
  return (
    error instanceof Error &&
    error.name === "HttpError" &&
    "status" in error &&
    typeof error.status === "number"
  );
}

function getUnavailableReason(
  error: unknown,
): Pick<AgentServerUnavailableError, "reason" | "status"> {
  if (isSdkHttpError(error)) {
    return {
      reason:
        error.status === 401 || error.status === 403
          ? "unauthorized"
          : "unreachable",
      status: error.status,
    };
  }

  return { reason: "unreachable", status: null };
}

function containsHtmlDocument(value: string): boolean {
  return /(?:<!doctype\s+html|<html\b|&lt;!doctype\s+html|&lt;html\b)/i.test(
    value,
  );
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getHttpFailurePrefix(message: string): string | null {
  const match = message.match(/^HTTP request failed\s*\(([^)]*)\)/i);
  if (!match) return null;

  const status = compactWhitespace(match[1]);
  return status ? `HTTP request failed (${status}).` : "HTTP request failed.";
}

function sanitizeAgentServerErrorDetails(error: unknown): string | null {
  if (!(error instanceof Error)) return null;

  const message = error.message.trim();
  if (!message) return null;

  if (containsHtmlDocument(message)) {
    const prefix = getHttpFailurePrefix(message);
    return prefix
      ? `${prefix} ${HTML_DOCUMENT_RESPONSE_DETAIL}`
      : HTML_DOCUMENT_RESPONSE_DETAIL;
  }

  const compacted = compactWhitespace(message);
  if (compacted.length <= MAX_AGENT_SERVER_ERROR_DETAIL_LENGTH) {
    return compacted;
  }

  return `${compacted.slice(0, MAX_AGENT_SERVER_ERROR_DETAIL_LENGTH).trimEnd()}...`;
}

function getAgentServerErrorDetails(error: unknown, backend: Backend) {
  const corsError = maybeCreateAgentServerCorsError(error, backend);
  if (corsError) return corsError.message;
  return sanitizeAgentServerErrorDetails(error);
}

export async function loadAgentServerInfo() {
  // The probe is a *local* agent-server concern — it verifies the runtime
  // hosting the GUI is reachable. It must NEVER run against the active
  // backend when that backend is cloud, because cloud hosts don't
  // expose /api/server_info and would fail with a CORS error besides.
  if (!hasEffectiveLocalBackend()) {
    clearCachedAgentServerInfo();
    throw new AgentServerUnavailableError();
  }

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
    const details = getAgentServerErrorDetails(error, local);
    const { reason, status } = getUnavailableReason(error);
    throw new AgentServerUnavailableError(details, reason, status);
  }

  cachedAgentServerInfo = serverInfo;
  return serverInfo;
}

export async function preflightAgentServerAccess() {
  const serverInfo = await loadAgentServerInfo();
  const local = getEffectiveLocalBackend();

  try {
    await new SettingsClient(
      getAgentServerClientOptions({
        host: local.host,
        sessionApiKey: local.apiKey || null,
        timeout: AGENT_SERVER_INFO_TIMEOUT_MS,
      }),
    ).getSettings();
  } catch (error) {
    clearCachedAgentServerInfo();
    const details = getAgentServerErrorDetails(error, local);
    const { reason, status } = getUnavailableReason(error);
    throw new AgentServerUnavailableError(details, reason, status);
  }

  return serverInfo;
}
