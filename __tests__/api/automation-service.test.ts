import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  Automation,
  AutomationsResponse,
  AutomationRunsResponse,
} from "#/types/automation";
import type { Backend } from "#/api/backend-registry/types";

// Use vi.hoisted to define mocks that will be available during vi.mock hoisting
const { mockGet, mockPatch, mockDelete, mockCallCloudProxy, mockGetActive } =
  vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockPatch: vi.fn(),
    mockDelete: vi.fn(),
    mockCallCloudProxy: vi.fn(),
    mockGetActive: vi.fn(),
  }));

vi.mock("axios", () => ({
  default: {
    create: () => ({
      get: mockGet,
      patch: mockPatch,
      delete: mockDelete,
      interceptors: {
        request: {
          use: vi.fn(),
        },
      },
    }),
  },
}));

vi.mock("#/api/cloud/proxy", () => ({
  callCloudProxy: mockCallCloudProxy,
}));

vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: mockGetActive,
}));

// Import after mocking
import AutomationService from "#/api/automation-service/automation-service.api";

const localBackend: Backend = {
  id: "local-1",
  name: "Local",
  host: "http://localhost:8000",
  apiKey: "session-key",
  kind: "local",
};

const cloudBackend: Backend = {
  id: "cloud-1",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-key",
  kind: "cloud",
};

const mockAutomation: Automation = {
  id: "1",
  name: "Test Automation",
  prompt: "A test automation",
  trigger: { type: "schedule", schedule_human: "Daily at 09:00" },
  enabled: true,
  repository: "acme/repo",
  model: "Claude Opus",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

describe("AutomationService", () => {
  beforeEach(() => {
    // restoreAllMocks (vs clearAllMocks) re-attaches the original
    // implementations of any class methods spied via vi.spyOn in earlier
    // tests, so the cloud-routing assertions actually exercise the real
    // method bodies instead of stale spies.
    vi.restoreAllMocks();
    mockGet.mockReset();
    mockPatch.mockReset();
    mockDelete.mockReset();
    mockCallCloudProxy.mockReset();
    // Default: active backend is local. Cloud-routing tests override this.
    mockGetActive.mockReset();
    mockGetActive.mockReturnValue({ backend: localBackend, orgId: null });
  });

  describe("listAutomations", () => {
    it("fetches paginated automations list with params object", async () => {
      const response: AutomationsResponse = {
        automations: [mockAutomation],
        total: 1,
      };
      mockGet.mockResolvedValue({ data: response });

      const result = await AutomationService.listAutomations({
        limit: 10,
        offset: 5,
      });

      expect(mockGet).toHaveBeenCalledWith("/api/automation/v1", {
        params: { limit: 10, offset: 5 },
      });
      expect(result).toEqual(response);
    });

    it("uses default params when none provided", async () => {
      const response: AutomationsResponse = {
        automations: [],
        total: 0,
      };
      mockGet.mockResolvedValue({ data: response });

      await AutomationService.listAutomations();

      expect(mockGet).toHaveBeenCalledWith("/api/automation/v1", {
        params: { limit: 50, offset: 0 },
      });
    });
  });

  describe("getAutomations", () => {
    it("delegates to listAutomations", async () => {
      const response: AutomationsResponse = {
        automations: [mockAutomation],
        total: 1,
      };
      vi.spyOn(AutomationService, "listAutomations").mockResolvedValue(
        response,
      );

      const result = await AutomationService.getAutomations(10, 5);

      expect(AutomationService.listAutomations).toHaveBeenCalledWith({
        limit: 10,
        offset: 5,
      });
      expect(result).toEqual(response);
    });
  });

  describe("getAutomation", () => {
    it("fetches a single automation by id", async () => {
      mockGet.mockResolvedValue({
        data: mockAutomation,
      });

      const result = await AutomationService.getAutomation("1");

      expect(mockGet).toHaveBeenCalledWith("/api/automation/v1/1");
      expect(result).toEqual(mockAutomation);
    });
  });

  describe("updateAutomation", () => {
    it("patches an automation with the provided body", async () => {
      const updated = { ...mockAutomation, name: "Updated Name" };
      mockPatch.mockResolvedValue({ data: updated });

      const result = await AutomationService.updateAutomation("1", {
        name: "Updated Name",
      });

      expect(mockPatch).toHaveBeenCalledWith("/api/automation/v1/1", {
        name: "Updated Name",
      });
      expect(result).toEqual(updated);
    });
  });

  describe("deleteAutomation", () => {
    it("deletes an automation by id", async () => {
      mockDelete.mockResolvedValue({});

      await AutomationService.deleteAutomation("1");

      expect(mockDelete).toHaveBeenCalledWith("/api/automation/v1/1");
    });
  });

  describe("listAutomationRuns", () => {
    it("fetches runs with params object", async () => {
      const response: AutomationRunsResponse = { runs: [], total: 0 };
      mockGet.mockResolvedValue({ data: response });

      const result = await AutomationService.listAutomationRuns("1", {
        limit: 20,
        offset: 10,
      });

      expect(mockGet).toHaveBeenCalledWith("/api/automation/v1/1/runs", {
        params: { limit: 20, offset: 10 },
      });
      expect(result).toEqual(response);
    });

    it("uses default params when none provided", async () => {
      const response: AutomationRunsResponse = { runs: [], total: 0 };
      mockGet.mockResolvedValue({ data: response });

      await AutomationService.listAutomationRuns("1");

      expect(mockGet).toHaveBeenCalledWith("/api/automation/v1/1/runs", {
        params: { limit: 50, offset: 0 },
      });
    });
  });

  describe("getAutomationRuns", () => {
    it("delegates to listAutomationRuns", async () => {
      const response: AutomationRunsResponse = { runs: [], total: 0 };
      vi.spyOn(AutomationService, "listAutomationRuns").mockResolvedValue(
        response,
      );

      const result = await AutomationService.getAutomationRuns("1", 25, 5);

      expect(AutomationService.listAutomationRuns).toHaveBeenCalledWith("1", {
        limit: 25,
        offset: 5,
      });
      expect(result).toEqual(response);
    });
  });

  describe("toggleAutomation", () => {
    it("delegates to updateAutomation with enabled field", async () => {
      const toggled = { ...mockAutomation, enabled: false };
      vi.spyOn(AutomationService, "updateAutomation").mockResolvedValue(
        toggled,
      );

      const result = await AutomationService.toggleAutomation("1", false);

      expect(AutomationService.updateAutomation).toHaveBeenCalledWith("1", {
        enabled: false,
      });
      expect(result).toEqual(toggled);
    });
  });

  // When the active backend is cloud the local axios instance must be
  // bypassed entirely; calls must route through `callCloudProxy` so the
  // bundled local agent-server forwards the request server-side to the
  // cloud host.
  describe("cloud routing", () => {
    beforeEach(() => {
      mockGetActive.mockReturnValue({ backend: cloudBackend, orgId: null });
    });

    it("listAutomations routes to callCloudProxy with pagination in the path", async () => {
      const response: AutomationsResponse = {
        automations: [mockAutomation],
        total: 1,
      };
      mockCallCloudProxy.mockResolvedValue(response);

      const result = await AutomationService.listAutomations({
        limit: 10,
        offset: 5,
      });

      expect(mockCallCloudProxy).toHaveBeenCalledWith({
        backend: cloudBackend,
        method: "GET",
        path: "/api/automation/v1?limit=10&offset=5",
      });
      expect(mockGet).not.toHaveBeenCalled();
      expect(result).toEqual(response);
    });

    it("getAutomation routes to callCloudProxy with the id in the path", async () => {
      mockCallCloudProxy.mockResolvedValue(mockAutomation);

      const result = await AutomationService.getAutomation("abc");

      expect(mockCallCloudProxy).toHaveBeenCalledWith({
        backend: cloudBackend,
        method: "GET",
        path: "/api/automation/v1/abc",
      });
      expect(result).toEqual(mockAutomation);
    });

    it("updateAutomation forwards method PATCH and body via callCloudProxy", async () => {
      const updated = { ...mockAutomation, enabled: false };
      mockCallCloudProxy.mockResolvedValue(updated);

      const result = await AutomationService.updateAutomation("abc", {
        enabled: false,
      });

      expect(mockCallCloudProxy).toHaveBeenCalledWith({
        backend: cloudBackend,
        method: "PATCH",
        path: "/api/automation/v1/abc",
        body: { enabled: false },
      });
      expect(mockPatch).not.toHaveBeenCalled();
      expect(result).toEqual(updated);
    });

    it("deleteAutomation forwards method DELETE via callCloudProxy", async () => {
      mockCallCloudProxy.mockResolvedValue(undefined);

      await AutomationService.deleteAutomation("abc");

      expect(mockCallCloudProxy).toHaveBeenCalledWith({
        backend: cloudBackend,
        method: "DELETE",
        path: "/api/automation/v1/abc",
      });
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });
});
