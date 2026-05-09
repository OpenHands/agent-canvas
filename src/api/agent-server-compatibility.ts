/* eslint-disable max-classes-per-file */
import { HttpError } from "@openhands/typescript-client/client/http-client";
import { getBundledBackend } from "#/api/backend-registry/bundled";
import {
  createServerClient,
  type ServerInfo as BaseServerInfo,
} from "#/api/typescript-client";

export const MINIMUM_SUPPORTED_AGENT_SERVER_VERSION = "1.17.0";
const AGENT_SERVER_INFO_TIMEOUT_MS = 5000;

const SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

export interface AgentServerInfo extends BaseServerInfo {
  usable_tools?: string[] | null;
}

let cachedAgentServerInfo: AgentServerInfo | null = null;

const getServerVersion = (serverInfo: AgentServerInfo): string =>
  serverInfo.version;

const getAdvertisedTools = (serverInfo: AgentServerInfo | null) => {
  if (Array.isArray(serverInfo?.usable_tools)) {
    return serverInfo.usable_tools;
  }
  return null;
};

const parseSemver = (
  version: string | null,
): [number, number, number] | null => {
  if (!version) {
    return null;
  }

  const match = version.match(SEMVER_PATTERN);
  if (!match) {
    return null;
  }

  return match.slice(1, 4).map(Number) as [number, number, number];
};

const isSupportedAgentServerVersion = (serverVersion: string | null) => {
  const parsedVersion = parseSemver(serverVersion);
  const minimumVersion = parseSemver(MINIMUM_SUPPORTED_AGENT_SERVER_VERSION);

  if (!parsedVersion || !minimumVersion) {
    return false;
  }

  for (let index = 0; index < minimumVersion.length; index += 1) {
    if (parsedVersion[index] > minimumVersion[index]) {
      return true;
    }

    if (parsedVersion[index] < minimumVersion[index]) {
      return false;
    }
  }

  return true;
};

const buildCompatibilityMessage = (serverVersion: string | null) => {
  const versionMessage = serverVersion
    ? `Connected agent server version ${serverVersion} is not compatible with this frontend.`
    : "The connected agent server version could not be determined.";

  return `${versionMessage} This frontend requires agent server version ${MINIMUM_SUPPORTED_AGENT_SERVER_VERSION} or newer. Upgrade the agent server and reload the page.`;
};

export class AgentServerIncompatibilityError extends Error {
  readonly serverVersion: string | null;

  constructor(serverVersion: string | null) {
    super(buildCompatibilityMessage(serverVersion));
    this.name = "AgentServerIncompatibilityError";
    this.serverVersion = serverVersion;
  }
}

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

export const isAgentServerIncompatibilityError = (
  error: unknown,
): error is AgentServerIncompatibilityError =>
  error instanceof AgentServerIncompatibilityError ||
  (typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AgentServerIncompatibilityError");

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

export async function ensureCompatibleAgentServer() {
  // The compatibility check is a *local* agent-server concern — it verifies
  // that the runtime hosting the GUI is at the right version. It must NEVER
  // run against the active backend, because cloud SaaS hosts don't expose
  // /api/server_info and would fail with a CORS error besides.
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
  const serverVersion = getServerVersion(serverInfo);

  if (!isSupportedAgentServerVersion(serverVersion)) {
    throw new AgentServerIncompatibilityError(serverVersion);
  }

  return serverInfo;
}
