import axios from "axios";
import { buildAuthHeaders } from "../backend-registry/auth";
import { getBundledBackend } from "../backend-registry/bundled";
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
   * `http://<id>.prod-runtime.all-hands.dev`) rather than the SaaS API.
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
 * POST a cloud-proxy envelope to the bundled local agent-server. The local
 * server forwards the request to the upstream host server-side, which
 * sidesteps the cross-origin restrictions that would block a direct
 * browser → SaaS or browser → runtime-sandbox call.
 *
 * Auth headers (bearer or session-api-key) are attached server-side; they
 * never cross an origin boundary in the browser.
 */
export async function callCloudProxy<TResponse = unknown>(
  req: CloudProxyRequest,
): Promise<TResponse> {
  const bundled = getBundledBackend();
  const upstreamHeaders = {
    ...buildUpstreamAuthHeaders(req),
    ...(req.headers ?? {}),
  };
  const upstreamHost = req.hostOverride ?? req.backend.host;

  // Talk directly to the bundled local agent-server, bypassing the global
  // openHands axios interceptor (which would otherwise read host + auth
  // from the active backend — wrong for this call).
  const response = await axios.post<TResponse>(
    `${bundled.host.replace(/\/+$/, "")}/api/cloud-proxy`,
    {
      host: upstreamHost,
      method: req.method,
      path: req.path,
      headers: upstreamHeaders,
      body: req.body ?? null,
      ...(req.timeoutSeconds ? { timeout_seconds: req.timeoutSeconds } : {}),
    },
    {
      headers: buildAuthHeaders(bundled),
      timeout: 30_000,
      ...(req.responseType ? { responseType: req.responseType } : {}),
    },
  );

  return response.data;
}
