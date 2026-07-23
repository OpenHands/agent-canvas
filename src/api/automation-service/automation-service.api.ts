import axios from "axios";
import type {
  Automation,
  AutomationRun,
  AutomationSpec,
  AutomationTrigger,
  AutomationsResponse,
  AutomationRunsResponse,
} from "#/types/automation";
import type { Backend, ResolvedActiveBackend } from "../backend-registry/types";
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

type AutomationSdkVersionResponse =
  | string
  | {
      sdk_version?: unknown;
      version?: unknown;
    };

// Local automation calls go to the automation sidecar that
// `scripts/dev-with-automation.mjs` mounts behind the local agent-server.
// Both backends use the same session API key and the same `X-Session-API-Key`
// header for consistency.
const localAutomationAxios = axios.create();

localAutomationAxios.interceptors.request.use((config) => {
  // Import uses an explicit baseURL/header pair so its POST, PATCH, and
  // cleanup stay pinned to the backend selected when the mutation started.
  if (config.baseURL) return config;

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
  config.baseURL = backend.host;

  const apiKey = backend.apiKey?.trim();
  if (apiKey) {
    config.headers.set("X-Session-API-Key", apiKey);
  }
  return config;
});

function normalizeAutomationSdkVersion(version: unknown): string | null {
  if (typeof version !== "string") return null;
  const trimmed = version.trim();
  return trimmed || null;
}

function getAutomationSdkVersionFromResponse(
  response: AutomationSdkVersionResponse,
): string | null {
  if (typeof response === "string") {
    return normalizeAutomationSdkVersion(response);
  }
  return (
    normalizeAutomationSdkVersion(response.sdk_version) ??
    normalizeAutomationSdkVersion(response.version)
  );
}

function buildPaginationQuery(limit: number, offset: number): string {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return params.toString();
}

function buildImportedTrigger(spec: AutomationSpec): AutomationTrigger {
  if (spec.trigger.type === "event") {
    return {
      type: "event",
      source: spec.trigger.source,
      on: spec.trigger.on,
      ...(spec.trigger.filter && { filter: spec.trigger.filter }),
    };
  }

  return {
    type: "cron",
    schedule: spec.trigger.schedule,
    timezone: spec.timezone ?? spec.trigger.timezone ?? "UTC",
  };
}

function generatePendingImportEvent(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `pending.${crypto.randomUUID()}`;
  }
  return `pending.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
}

function buildCreateAutomationRequest(spec: AutomationSpec) {
  if (!spec.prompt) {
    throw new Error("An automation prompt is required for import.");
  }

  const repos = spec.repository
    ? [
        {
          url: spec.repository,
          ...(spec.branch && { ref: spec.branch }),
          ...(!spec.repository.includes("://") &&
            !spec.repository.startsWith("git@") && { provider: "github" }),
        },
      ]
    : undefined;

  return {
    path: `${AUTOMATION_BASE_PATH}/v1/preset/${spec.plugins?.length ? "plugin" : "prompt"}`,
    body: {
      name: spec.name,
      prompt: spec.prompt,
      // Preset creation defaults to enabled. A unique event trigger keeps the
      // new record inert until the real trigger and disabled state are applied
      // together in the follow-up PATCH.
      trigger: {
        type: "event",
        source: "agent-canvas-import",
        on: generatePendingImportEvent(),
      },
      ...(spec.model && { model: spec.model }),
      ...(repos && { repos }),
      ...(spec.plugins?.length && {
        plugins: spec.plugins.map((source) => ({ source })),
      }),
      ...(spec.timeout != null && { timeout: spec.timeout }),
    },
  };
}

function buildPinnedLocalConfig(backend: Backend) {
  const apiKey = backend.apiKey.trim();
  return {
    baseURL: backend.host,
    ...(apiKey && { headers: { "X-Session-API-Key": apiKey } }),
  };
}

function buildPinnedCloudHeaders(active: ResolvedActiveBackend) {
  return active.orgId ? { "X-Org-Id": active.orgId } : undefined;
}

class AutomationService {
  static async getSdkVersion(): Promise<string | null> {
    const active = getActiveBackend();
    const path = `${AUTOMATION_BASE_PATH}/sdk-version`;

    try {
      let response: AutomationSdkVersionResponse;
      if (active.backend.kind === "cloud") {
        response = await callCloudProxy<AutomationSdkVersionResponse>({
          backend: active.backend,
          method: "GET",
          path,
          headers: buildPinnedCloudHeaders(active),
          timeoutSeconds: 5,
        });
      } else {
        const { data } =
          await localAutomationAxios.get<AutomationSdkVersionResponse>(path, {
            timeout: 5000,
          });
        response = data;
      }

      return getAutomationSdkVersionFromResponse(response);
    } catch {
      return null;
    }
  }

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

  static async createAutomation(spec: AutomationSpec): Promise<Automation> {
    const active = getActiveBackend();
    const { path, body } = buildCreateAutomationRequest(spec);

    let created: Automation;
    if (active.backend.kind === "cloud") {
      created = await callCloudProxy<Automation>({
        backend: active.backend,
        method: "POST",
        path,
        body,
        headers: buildPinnedCloudHeaders(active),
      });
    } else {
      const { data } = await localAutomationAxios.post<Automation>(
        path,
        body,
        buildPinnedLocalConfig(active.backend),
      );
      created = data;
    }

    const updatePath = `${AUTOMATION_BASE_PATH}/v1/${encodeURIComponent(created.id)}`;
    const updateBody: Partial<Automation> = {
      trigger: buildImportedTrigger(spec),
      enabled: false,
    };

    try {
      if (active.backend.kind === "cloud") {
        return await callCloudProxy<Automation>({
          backend: active.backend,
          method: "PATCH",
          path: updatePath,
          body: updateBody,
          headers: buildPinnedCloudHeaders(active),
        });
      }

      const { data } = await localAutomationAxios.patch<Automation>(
        updatePath,
        updateBody,
        buildPinnedLocalConfig(active.backend),
      );
      return data;
    } catch (updateError) {
      try {
        if (active.backend.kind === "cloud") {
          await callCloudProxy<unknown>({
            backend: active.backend,
            method: "DELETE",
            path: updatePath,
            headers: buildPinnedCloudHeaders(active),
          });
        } else {
          await localAutomationAxios.delete(
            updatePath,
            buildPinnedLocalConfig(active.backend),
          );
        }
      } catch (cleanupError) {
        throw new AggregateError(
          [updateError, cleanupError],
          "Failed to disable the imported automation and clean it up.",
        );
      }
      throw updateError;
    }
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
