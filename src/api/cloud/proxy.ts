import axios from "axios";
import {
  getAgentServerBaseUrl,
  getAgentServerHeaders,
} from "../agent-server-config";
import { getActiveBackend } from "../backend-registry/active-store";
import { NoBackendAvailableError } from "../agent-server-client-options";
import { buildAuthHeaders } from "../backend-registry/auth";
import type { Backend } from "../backend-registry/types";

type CloudMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface CloudApiRequest {
  backend: Backend;
  method: CloudMethod;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutSeconds?: number;
  responseType?: "blob";
}

export interface LegacyRuntimeCloudProxyRequest {
  backend: Backend;
  method: CloudMethod;
  host: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutSeconds?: number;
  sessionApiKey?: string | null;
  responseType?: "blob";
}

function buildCloudHeaders(req: CloudApiRequest): Record<string, string> {
  const active = getActiveBackend();
  const orgIdHeader: Record<string, string> =
    active.backend.id === req.backend.id && active.orgId
      ? { "X-Org-Id": active.orgId }
      : {};

  return {
    ...buildAuthHeaders(req.backend),
    ...orgIdHeader,
    ...(req.headers ?? {}),
  };
}

/**
 * Send a first-class request to the configured cloud/app backend.
 *
 * This does not use `/api/cloud-proxy`: the browser calls `backend.host`
 * directly with the cloud backend's auth headers.
 */
export async function callCloudApi<TResponse = unknown>(
  req: CloudApiRequest,
): Promise<TResponse> {
  const response = await axios.request<TResponse>({
    url: `${req.backend.host.replace(/\/+$/, "")}${req.path}`,
    method: req.method,
    headers: buildCloudHeaders(req),
    ...(req.body !== undefined ? { data: req.body } : {}),
    timeout: (req.timeoutSeconds ?? 30) * 1000,
    ...(req.responseType ? { responseType: req.responseType } : {}),
  });

  return response.data;
}

/**
 * @deprecated Legacy bridge for runtime-sandbox endpoints that still lack a
 * first-class cloud/app API. Prefer `callCloudApi` and app-server gateway
 * routes for any new or migrated code.
 */
export async function callLegacyRuntimeCloudProxy<TResponse = unknown>(
  req: LegacyRuntimeCloudProxyRequest,
): Promise<TResponse> {
  const proxyBaseUrl = getAgentServerBaseUrl();
  if (!proxyBaseUrl) throw new NoBackendAvailableError();

  const headers = {
    ...(req.sessionApiKey ? { "X-Session-API-Key": req.sessionApiKey } : {}),
    ...(req.headers ?? {}),
  };

  const response = await axios.post<TResponse>(
    `${proxyBaseUrl.replace(/\/+$/, "")}/api/cloud-proxy`,
    {
      host: req.host,
      method: req.method,
      path: req.path,
      headers,
      body: req.body ?? null,
      ...(req.timeoutSeconds ? { timeout_seconds: req.timeoutSeconds } : {}),
    },
    {
      headers: getAgentServerHeaders(),
      timeout: 30_000,
      ...(req.responseType ? { responseType: req.responseType } : {}),
    },
  );

  return response.data;
}
