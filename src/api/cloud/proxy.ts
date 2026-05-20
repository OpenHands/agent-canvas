import axios, { type Method } from "axios";
import { getActiveBackend } from "../backend-registry/active-store";
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
   * Override the upstream host. When set, the request targets this host
   * instead of `backend.host`. Used for runtime-sandbox calls where the
   * upstream lives at the conversation's runtime URL (e.g.
   * `http://<id>.prod-runtime.all-hands.dev`) rather than the cloud API.
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
   * Axios responseType. Set to "blob" when the upstream endpoint returns
   * a binary payload (e.g. ZIP downloads); leave undefined for default
   * JSON.
   */
  responseType?: "blob";
}

function buildUpstreamAuthHeaders(
  req: CloudProxyRequest,
): Record<string, string> {
  const mode = req.authMode ?? "bearer";
  if (mode === "bearer") return buildAuthHeaders(req.backend);
  if (mode === "session-api-key") {
    if (!req.sessionApiKey) {
      throw new Error(
        "callCloudProxy: sessionApiKey is required when authMode is 'session-api-key'",
      );
    }
    return { "X-Session-API-Key": req.sessionApiKey };
  }
  return {};
}

/**
 * Call the upstream cloud (or sandbox) host directly from the browser.
 *
 * Relies on the OpenHands SaaS exposing permissive CORS for API-key
 * authenticated requests, so no local agent-server hop is needed.
 *
 * Auth headers (bearer or session-api-key) are attached client-side; the
 * `X-Org-Id` header is added only when the request targets the active
 * backend, so per-backend bookkeeping calls don't carry the active orgId
 * across an unrelated API key.
 */
export async function callCloudProxy<TResponse = unknown>(
  req: CloudProxyRequest,
): Promise<TResponse> {
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
  const url = `${upstreamHost.replace(/\/+$/, "")}${req.path}`;
  const timeoutMs = req.timeoutSeconds
    ? Math.round(req.timeoutSeconds * 1000)
    : 30_000;

  const response = await axios.request<TResponse>({
    method: req.method as Method,
    url,
    data: req.body,
    headers: upstreamHeaders,
    timeout: timeoutMs,
    ...(req.responseType ? { responseType: req.responseType } : {}),
  });

  return response.data;
}
