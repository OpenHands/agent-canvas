import { getAgentServerSessionApiKey } from "../agent-server-config";
import { DEFAULT_LOCAL_BACKEND_ID } from "./default-backend";
import { isAgentServerBackend, type Backend } from "./types";

/**
 * Build the auth headers to send to a backend.
 *
 * Local and remote agent servers use `X-Session-API-Key`. Cloud expects a
 * bearer token in the `Authorization` header.
 */
export function buildAuthHeaders(backend: Backend): Record<string, string> {
  if (
    isAgentServerBackend(backend) &&
    backend.id === DEFAULT_LOCAL_BACKEND_ID
  ) {
    const configuredSessionApiKey = getAgentServerSessionApiKey();
    if (configuredSessionApiKey) {
      return { "X-Session-API-Key": configuredSessionApiKey };
    }
  }

  if (!backend.apiKey) return {};

  if (backend.kind === "cloud") {
    return { Authorization: `Bearer ${backend.apiKey}` };
  }

  return { "X-Session-API-Key": backend.apiKey };
}
