import axios from "axios";
import {
  getAgentServerBaseUrl,
  getAgentServerHeaders,
} from "../agent-server-config";
import { getActiveBackend } from "../backend-registry/active-store";
import { NoBackendAvailableError } from "../agent-server-client-options";
import { buildAuthHeaders } from "../backend-registry/auth";
import type { Backend } from "../backend-registry/types";

interface CloudProxyRequest {
  /**
   * Cloud backend whose bearer token authenticates the upstream call.
   * `backend.host` is also the default upstream host unless `hostOverride`
   * is set.
   */
  backend: Backend;
  /** HTTP method against the upstream host. */
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Path on the upstream host, e.g. "/api/v1/conversation/123/events/search". */
  path: string;
  /** Optional JSON body for non-GET methods. */
  body?: unknown;
  /** Extra headers merged with the auth header for the upstream call. */
  headers?: Record<string, string>;
  /** Override the upstream timeout, in seconds. */
  timeoutSeconds?: number;
  /**
   * Override the upstream host. When set, the proxy targets this host
   * instead of `backend.host`. Used for runtime-sandbox calls where the
   * upstream lives at the conversation's runtime URL (e.g.
   * `http://<id>.prod-runtime.all-hands.dev`) rather than the cloud API.
   * The host must still pass the proxy's allowlist server-side.
   */
  hostOverride?: string;
  /**
   * Auth strategy for the upstream call. Defaults to "bearer" (uses the
   * cloud backend's bearer token via `buildAuthHeaders`). For
   * runtime-sandbox calls, set to "session-api-key" and pass
   * `sessionApiKey` — those endpoints don't accept bearer tokens, only
   * `X-Session-API-Key`. "none" sends no auth header.
   */
  authMode?: "bearer" | "session-api-key" | "none";
  /** Required when `authMode === "session-api-key"`. */
  sessionApiKey?: string | null;
  /**
   * Axios responseType for the inner POST to the bundled agent-server.
   * Set to "blob" when the upstream cloud endpoint returns a binary
   * payload (e.g. ZIP downloads); leave undefined for default JSON.
   */
  responseType?: "blob";
}

function buildUpstreamAuthHeaders(
  req: CloudProxyRequest,
): Record<string, string> {
  const mode = req.authMode ?? "bearer";
  if (mode === "bearer") return buildAuthHeaders(req.backend);
  if (mode === "session-api-key") {
    return req.sessionApiKey ? { "X-Session-API-Key": req.sessionApiKey } : {};
  }
  return {};
}

/**
 * Send a cloud request. App-host calls (`backend.host`) go directly to the
 * cloud API with the cloud backend's auth headers. Runtime-sandbox calls pass
 * `hostOverride`, and those still go through `/api/cloud-proxy` because the
 * per-conversation runtime hosts are not the configured cloud app origin.
 *
 * App-host auth headers are sent directly to the cloud host. Runtime auth
 * headers are carried in the proxy envelope and attached server-side.
 */
export async function callCloudProxy<TResponse = unknown>(
  req: CloudProxyRequest,
): Promise<TResponse> {
  // Send `X-Org-Id` so the upstream scopes per-request to the org the user
  // selected locally, instead of the user's globally-shared
  // `current_org_id` on the cloud backend. Restricted to calls against the active
  // backend: the selector also fans out per-backend bookkeeping calls
  // (e.g. `getCloudOrganizations(b)`) that would otherwise carry the
  // active backend's orgId across an unrelated API key, which the cloud backend
  // rejects when api_key_org_id and X-Org-Id disagree.
  const active = getActiveBackend();
  const orgIdHeader =
    active.backend.id === req.backend.id && active.orgId
      ? { "X-Org-Id": active.orgId }
      : {};
  const upstreamHeaders = {
    ...buildUpstreamAuthHeaders(req),
    ...orgIdHeader,
    ...(req.headers ?? {}),
  };
  const upstreamHost = req.hostOverride ?? req.backend.host;

  if (!req.hostOverride) {
    const response = await axios.request<TResponse>({
      url: `${upstreamHost.replace(/\/+$/, "")}${req.path}`,
      method: req.method,
      headers: upstreamHeaders,
      ...(req.body !== undefined ? { data: req.body } : {}),
      timeout: (req.timeoutSeconds ?? 30) * 1000,
      ...(req.responseType ? { responseType: req.responseType } : {}),
    });

    return response.data;
  }

  const proxyBaseUrl = getAgentServerBaseUrl();
  if (!proxyBaseUrl) throw new NoBackendAvailableError();
  const localAuthHeaders = getAgentServerHeaders();

  // Talk to the configured app/ingress origin that exposes /api/cloud-proxy.
  // Do not resolve this through the backend registry: when the active backend
  // is cloud, borrowing some other registered local backend would silently
  // route cloud traffic through the wrong user-configured server.
  const response = await axios.post<TResponse>(
    `${proxyBaseUrl.replace(/\/+$/, "")}/api/cloud-proxy`,
    {
      host: upstreamHost,
      method: req.method,
      path: req.path,
      headers: upstreamHeaders,
      body: req.body ?? null,
      ...(req.timeoutSeconds ? { timeout_seconds: req.timeoutSeconds } : {}),
    },
    {
      headers: localAuthHeaders,
      timeout: 30_000,
      ...(req.responseType ? { responseType: req.responseType } : {}),
    },
  );

  return response.data;
}
