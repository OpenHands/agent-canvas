import type { Backend } from "./types";

/**
 * Build the auth headers to send to a backend.
 *
 * Local agent-server uses `X-Session-API-Key`. Cloud SaaS expects a bearer
 * token in the `Authorization` header.
 */
export function buildAuthHeaders(backend: Backend): Record<string, string> {
  if (!backend.apiKey) return {};

  if (backend.kind === "cloud") {
    return { Authorization: `Bearer ${backend.apiKey}` };
  }

  return { "X-Session-API-Key": backend.apiKey };
}
