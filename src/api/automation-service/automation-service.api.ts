import axios from "axios";
import type {
  Automation,
  AutomationsResponse,
  AutomationRunsResponse,
} from "#/types/automation";
import { getAgentServerBaseUrl } from "../agent-server-config";
import { getActiveBackend } from "../backend-registry/active-store";
import { callCloudProxy } from "../cloud/proxy";

const AUTOMATION_BASE_PATH = "/api/automation";

export interface AutomationHealthResponse {
  status: "ok" | "error";
  message?: string;
}

// Local automation calls go to the automation sidecar that
// `scripts/dev-with-automation.mjs` mounts behind the bundled agent-server.
// That sidecar authenticates via its own `VITE_AUTOMATION_API_KEY` Bearer
// token — NOT the agent-server's `X-Session-API-Key` — so we cannot reuse
// the shared `openHands` axios for these calls.
const localAutomationAxios = axios.create({
  baseURL: getAgentServerBaseUrl(),
});

localAutomationAxios.interceptors.request.use((config) => {
  const apiKey = import.meta.env.VITE_AUTOMATION_API_KEY?.trim();
  if (apiKey) {
    config.headers.set("Authorization", `Bearer ${apiKey}`);
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

  static async toggleAutomation(
    id: string,
    enabled: boolean,
  ): Promise<Automation> {
    return AutomationService.updateAutomation(id, { enabled });
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
