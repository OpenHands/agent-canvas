import axios from "axios";
import type {
  Automation,
  AutomationRun,
  AutomationsResponse,
  AutomationRunsResponse,
} from "#/types/automation";
import {
  getActiveBackend,
  getEffectiveLocalBackend,
} from "../backend-registry/active-store";
import { NoBackendAvailableError } from "../agent-server-client-options";
import { callCloudProxy } from "../cloud/proxy";

const AUTOMATION_BASE_PATH = "/api/automation";

export interface AutomationHealthResponse {
  status: "ok" | "error";
  message?: string;
}

// Local automation calls go to the automation sidecar that
// `scripts/dev-with-automation.mjs` mounts behind the local agent-server.
// Both backends use the same session API key and the same `X-Session-API-Key`
// header for consistency.
const localAutomationAxios = axios.create();

localAutomationAxios.interceptors.request.use((config) => {
  // Resolve the local backend on every call so it tracks the
  // currently-active local backend (and any host/key edits made via the
  // manage-backends UI), rather than freezing whatever value the
  // agent-server-config produced at module load time.
  // Using the backend registry (rather than the build-time VITE_SESSION_API_KEY
  // env var) ensures the published npm package picks up the runtime-injected
  // session key that scripts/static-server.mjs seeds into localStorage, fixing
  // the 401 errors reported in issue #829.
  const backend = getEffectiveLocalBackend();
  if (!backend) throw new NoBackendAvailableError();
  // eslint-disable-next-line no-param-reassign
  if (!config.baseURL) config.baseURL = backend.host;

  const apiKey = backend.apiKey?.trim();
  if (apiKey) {
    config.headers.set("X-Session-API-Key", apiKey);
  }
  return config;
});

function buildPaginationQuery(limit: number, offset: number): string {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return params.toString();
}

class AutomationService {
  static async listAutomations(
    params: { limit?: number; offset?: number } = {},
  ): Promise<AutomationsResponse> {
    const { limit = 50, offset = 0 } = params;
    const active = getActiveBackend().backend;

    if (active.kind === "cloud") {
      return callCloudProxy<AutomationsResponse>({
        backend: active,
        method: "GET",
        path: `${AUTOMATION_BASE_PATH}/v1?${buildPaginationQuery(limit, offset)}`,
      });
    }

    const { data } = await localAutomationAxios.get<AutomationsResponse>(
      `${AUTOMATION_BASE_PATH}/v1`,
      { params: { limit, offset } },
    );
    return data;
  }

  static async getAutomations(
    limit = 50,
    offset = 0,
  ): Promise<AutomationsResponse> {
    return AutomationService.listAutomations({ limit, offset });
  }

  static async getAutomation(id: string): Promise<Automation> {
    const active = getActiveBackend().backend;
    const path = `${AUTOMATION_BASE_PATH}/v1/${encodeURIComponent(id)}`;

    if (active.kind === "cloud") {
      return callCloudProxy<Automation>({
        backend: active,
        method: "GET",
        path,
      });
    }

    const { data } = await localAutomationAxios.get<Automation>(path);
    return data;
  }

  static async updateAutomation(
    id: string,
    body: Partial<Automation>,
  ): Promise<Automation> {
    const active = getActiveBackend().backend;
    const path = `${AUTOMATION_BASE_PATH}/v1/${encodeURIComponent(id)}`;

    if (active.kind === "cloud") {
      return callCloudProxy<Automation>({
        backend: active,
        method: "PATCH",
        path,
        body: body as Record<string, unknown>,
      });
    }

    const { data } = await localAutomationAxios.patch<Automation>(path, body);
    return data;
  }

  static async deleteAutomation(id: string): Promise<void> {
    const active = getActiveBackend().backend;
    const path = `${AUTOMATION_BASE_PATH}/v1/${encodeURIComponent(id)}`;

    if (active.kind === "cloud") {
      await callCloudProxy<unknown>({
        backend: active,
        method: "DELETE",
        path,
      });
      return;
    }

    await localAutomationAxios.delete(path);
  }

  static async dispatchAutomation(id: string): Promise<AutomationRun> {
    const active = getActiveBackend().backend;
    const path = `${AUTOMATION_BASE_PATH}/v1/${encodeURIComponent(id)}/dispatch`;

    if (active.kind === "cloud") {
      return callCloudProxy<AutomationRun>({
        backend: active,
        method: "POST",
        path,
      });
    }

    const { data } = await localAutomationAxios.post<AutomationRun>(path);
    return data;
  }

  static async listAutomationRuns(
    id: string,
    params: { limit?: number; offset?: number } = {},
  ): Promise<AutomationRunsResponse> {
    const { limit = 50, offset = 0 } = params;
    const active = getActiveBackend().backend;
    const basePath = `${AUTOMATION_BASE_PATH}/v1/${encodeURIComponent(id)}/runs`;

    if (active.kind === "cloud") {
      return callCloudProxy<AutomationRunsResponse>({
        backend: active,
        method: "GET",
        path: `${basePath}?${buildPaginationQuery(limit, offset)}`,
      });
    }

    const { data } = await localAutomationAxios.get<AutomationRunsResponse>(
      basePath,
      { params: { limit, offset } },
    );
    return data;
  }

  static async getAutomationRuns(
    id: string,
    limit = 50,
    offset = 0,
  ): Promise<AutomationRunsResponse> {
    return AutomationService.listAutomationRuns(id, { limit, offset });
  }

  static async cancelRun(runId: string): Promise<AutomationRun> {
    const active = getActiveBackend().backend;
    const path = `${AUTOMATION_BASE_PATH}/v1/runs/${encodeURIComponent(runId)}/cancel`;

    if (active.kind === "cloud") {
      return callCloudProxy<AutomationRun>({
        backend: active,
        method: "POST",
        path,
      });
    }

    const { data } = await localAutomationAxios.post<AutomationRun>(path);
    return data;
  }

  static async toggleAutomation(
    id: string,
    enabled: boolean,
  ): Promise<Automation> {
    return AutomationService.updateAutomation(id, { enabled });
  }

  static async downloadTarball(id: string, name: string): Promise<void> {
    const active = getActiveBackend().backend;
    const path = `${AUTOMATION_BASE_PATH}/v1/${encodeURIComponent(id)}/tarball`;

    let blob: Blob;
    if (active.kind === "cloud") {
      blob = await callCloudProxy<Blob>({
        backend: active,
        method: "GET",
        path,
        responseType: "blob",
      });
    } else {
      const { data } = await localAutomationAxios.get<Blob>(path, {
        responseType: "blob",
      });
      blob = data;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.tar`;
    a.click();
    URL.revokeObjectURL(url);
  }

  static async checkHealth(): Promise<AutomationHealthResponse> {
    const active = getActiveBackend().backend;
    const path = `${AUTOMATION_BASE_PATH}/health`;

    try {
      if (active.kind === "cloud") {
        const response = await callCloudProxy<AutomationHealthResponse>({
          backend: active,
          method: "GET",
          path,
          // Fail fast, matching the local branch's 5s timeout below.
          timeoutSeconds: 5,
        });
        return response;
      }

      const { data } = await localAutomationAxios.get<AutomationHealthResponse>(
        path,
        { timeout: 5000 },
      );
      return data;
    } catch {
      return { status: "error" };
    }
  }
}

export default AutomationService;
