import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  Automation,
  AutomationsResponse,
  AutomationRunsResponse,
} from "#/types/automation";

// Use vi.hoisted to define mocks that will be available during vi.mock hoisting
const { mockGet, mockPatch, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
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

// Import after mocking
import AutomationService from "#/api/automation-service/automation-service.api";

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
    vi.clearAllMocks();
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
});
