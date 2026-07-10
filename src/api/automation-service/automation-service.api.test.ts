import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import type { Automation, AutomationSpec } from "#/types/automation";
import AutomationService from "./automation-service.api";

const { localAxios, axiosRequest } = vi.hoisted(() => ({
  localAxios: {
    interceptors: { request: { use: vi.fn() } },
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  axiosRequest: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    create: () => localAxios,
    request: axiosRequest,
    post: vi.fn(),
  },
}));

const localBackend: Backend = {
  id: "local-test",
  name: "Local test backend",
  host: "http://localhost:3000",
  apiKey: "test-session-key",
  kind: "local",
};

const cloudBackend: Backend = {
  id: "cloud-test",
  name: "Cloud test backend",
  host: "https://app.example.test",
  apiKey: "cloud-api-key",
  kind: "cloud",
};

const spec: AutomationSpec = {
  name: "Imported review",
  prompt: "Review open pull requests.",
  trigger: {
    type: "cron",
    schedule: "0 9 * * *",
    schedule_human: "Daily at 09:00",
  },
  enabled: true,
  repository: "openhands/agent-canvas",
  branch: "main",
  plugins: ["github:openhands/extensions"],
  model: "fast",
  timezone: "America/Los_Angeles",
};

const createdAutomation: Automation = {
  id: "created-automation",
  name: spec.name,
  prompt: spec.prompt,
  trigger: { type: "cron", schedule: spec.trigger.schedule },
  enabled: true,
  model: spec.model,
  created_at: "2026-07-10T00:00:00Z",
  updated_at: "2026-07-10T00:00:00Z",
};

describe("AutomationService.createAutomation", () => {
  beforeEach(() => {
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });
    localAxios.post.mockResolvedValue({ data: createdAutomation });
    localAxios.patch.mockImplementation(
      async (_path: string, body: Partial<Automation>) => ({
        data: { ...createdAutomation, ...body },
      }),
    );
  });

  afterEach(() => {
    setActiveSelection(null);
    setRegisteredBackends([]);
    vi.clearAllMocks();
  });

  it("creates plugin automations through the preset API and disables them", async () => {
    const created = await AutomationService.createAutomation(spec);

    expect(localAxios.post).toHaveBeenCalledWith(
      "/api/automation/v1/preset/plugin",
      {
        name: spec.name,
        prompt: spec.prompt,
        model: spec.model,
        trigger: {
          type: "event",
          source: "agent-canvas-import",
          on: expect.stringMatching(/^pending\./),
        },
        repos: [
          {
            url: spec.repository,
            ref: spec.branch,
            provider: "github",
          },
        ],
        plugins: [{ source: spec.plugins![0] }],
      },
      {
        baseURL: localBackend.host,
        headers: { "X-Session-API-Key": localBackend.apiKey },
      },
    );
    expect(localAxios.patch).toHaveBeenCalledWith(
      "/api/automation/v1/created-automation",
      {
        trigger: {
          type: "cron",
          schedule: spec.trigger.schedule,
          timezone: spec.timezone,
        },
        enabled: false,
      },
      {
        baseURL: localBackend.host,
        headers: { "X-Session-API-Key": localBackend.apiKey },
      },
    );
    expect(created.enabled).toBe(false);
  });

  it("uses the prompt preset path when no plugins are configured", async () => {
    await AutomationService.createAutomation({
      ...spec,
      plugins: undefined,
    });

    expect(localAxios.post).toHaveBeenCalledWith(
      "/api/automation/v1/preset/prompt",
      expect.not.objectContaining({ plugins: expect.anything() }),
      expect.any(Object),
    );
  });

  it("applies the imported event trigger while disabling the automation", async () => {
    const eventTrigger = {
      type: "event",
      source: "github",
      on: ["pull_request.opened", "pull_request.synchronize"],
      filter: "repository.full_name == 'openhands/agent-canvas'",
    };

    await AutomationService.createAutomation({
      ...spec,
      trigger: eventTrigger,
    });

    expect(localAxios.patch).toHaveBeenCalledWith(
      "/api/automation/v1/created-automation",
      { trigger: eventTrigger, enabled: false },
      expect.any(Object),
    );
  });

  it("uses the selected cloud backend and organization for both requests", async () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id, orgId: "org-1" });
    axiosRequest
      .mockResolvedValueOnce({ data: createdAutomation })
      .mockResolvedValueOnce({
        data: { ...createdAutomation, enabled: false },
      });

    const created = await AutomationService.createAutomation(spec);

    expect(axiosRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        url: `${cloudBackend.host}/api/automation/v1/preset/plugin`,
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${cloudBackend.apiKey}`,
          "X-Org-Id": "org-1",
        }),
      }),
    );
    expect(axiosRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        url: `${cloudBackend.host}/api/automation/v1/created-automation`,
        method: "PATCH",
        data: expect.objectContaining({ enabled: false }),
        headers: expect.objectContaining({ "X-Org-Id": "org-1" }),
      }),
    );
    expect(created.enabled).toBe(false);
  });

  it("removes the inert automation when disabling it fails", async () => {
    const updateError = new Error("update failed");
    localAxios.patch.mockRejectedValueOnce(updateError);

    await expect(AutomationService.createAutomation(spec)).rejects.toBe(
      updateError,
    );

    expect(localAxios.delete).toHaveBeenCalledWith(
      "/api/automation/v1/created-automation",
      {
        baseURL: localBackend.host,
        headers: { "X-Session-API-Key": localBackend.apiKey },
      },
    );
  });
});
