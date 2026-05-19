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
import { callCloudProxy } from "../cloud/proxy";

const AUTOMATION_BASE_PATH = "/api/automation";

interface AutomationApiResponse extends Omit<Automation, "model"> {
  model?: string | null;
  llm_profile?: string | null;
}

interface AutomationsApiResponse extends Omit<
  AutomationsResponse,
  "automations"
> {
  automations: AutomationApiResponse[];
}

function normalizeAutomation(automation: AutomationApiResponse): Automation {
  const { llm_profile: llmProfile, ...rest } = automation;
  return {
    ...rest,
    model: rest.model ?? llmProfile ?? null,
  };
}

function normalizeAutomationsResponse(
  response: AutomationsApiResponse,
): AutomationsResponse {
  return {
    ...response,
    automations: response.automations.map(normalizeAutomation),
  };
}

function toAutomationApiBody(
  body: Partial<Automation>,
): Record<string, unknown> {
  const { model, ...rest } = body;
  return {
    ...rest,
    ...(model !== undefined ? { llm_profile: model } : {}),
  };
}

export interface AutomationHealthResponse {
  status: "ok" | "error";
  message?: string;
}

// Local automation calls go to the automation sidecar that
// `scripts/dev-with-automation.mjs` mounts behind the local agent-server.
// That sidecar authenticates via its own `VITE_AUTOMATION_API_KEY` Bearer
// token — NOT the agent-server's `X-Session-API-Key` — so we cannot reuse
// the default local agent-server client for these calls.
const localAutomationAxios = axios.create();

localAutomationAxios.interceptors.request.use((config) => {
  // Resolve the local backend host on every call so it tracks the
  // currently-active local backend (and any host edits made via the
  // manage-backends UI), rather than freezing whatever value the
  // agent-server-config produced at module load time.
  // eslint-disable-next-line no-param-reassign
  if (!config.baseURL) config.baseURL = getEffectiveLocalBackend().host;

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
      const response = await callCloudProxy<AutomationsApiResponse>({
        backend: active,
        method: "GET",
        path: `${AUTOMATION_BASE_PATH}/v1?${buildPaginationQuery(limit, offset)}`,
      });
      return normalizeAutomationsResponse(response);
    }

    const { data } = await localAutomationAxios.get<AutomationsApiResponse>(
      `${AUTOMATION_BASE_PATH}/v1`,
      { params: { limit, offset } },
    );
    return normalizeAutomationsResponse(data);
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
      const response = await callCloudProxy<AutomationApiResponse>({
        backend: active,
        method: "GET",
        path,
      });
      return normalizeAutomation(response);
    }

    const { data } =
      await localAutomationAxios.get<AutomationApiResponse>(path);
    return normalizeAutomation(data);
  }

  static async updateAutomation(
    id: string,
    body: Partial<Automation>,
  ): Promise<Automation> {
    const active = getActiveBackend().backend;
    const path = `${AUTOMATION_BASE_PATH}/v1/${encodeURIComponent(id)}`;

    const apiBody = toAutomationApiBody(body);

    if (active.kind === "cloud") {
      const response = await callCloudProxy<AutomationApiResponse>({
        backend: active,
        method: "PATCH",
        path,
        body: apiBody,
      });
      return normalizeAutomation(response);
    }

    const { data } = await localAutomationAxios.patch<AutomationApiResponse>(
      path,
      apiBody,
    );
    return normalizeAutomation(data);
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
