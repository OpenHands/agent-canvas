import { describe, it, expect, vi, beforeEach } from "vitest";
import AutomationService from "#/api/automation-service/automation-service.api";
import { openHands } from "#/api/open-hands-axios";
import type {
  Automation,
  AutomationsResponse,
  AutomationRunsResponse,
} from "#/types/automation";

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
    vi.restoreAllMocks();
  });

  describe("listAutomations", () => {
    it("fetches paginated automations list with params object", async () => {
      const response: AutomationsResponse = {
        automations: [mockAutomation],
        total: 1,
      };
      vi.spyOn(openHands, "get").mockResolvedValue({ data: response });

      const result = await AutomationService.listAutomations({
        limit: 10,
        offset: 5,
      });

      expect(openHands.get).toHaveBeenCalledWith("/api/automation/v1", {
        params: { limit: 10, offset: 5 },
      });
      expect(result).toEqual(response);
    });

    it("uses default params when none provided", async () => {
      const response: AutomationsResponse = {
        automations: [],
        total: 0,
      };
      vi.spyOn(openHands, "get").mockResolvedValue({ data: response });

      await AutomationService.listAutomations();

      expect(openHands.get).toHaveBeenCalledWith("/api/automation/v1", {
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
      vi.spyOn(openHands, "get").mockResolvedValue({
        data: mockAutomation,
      });

      const result = await AutomationService.getAutomation("1");

      expect(openHands.get).toHaveBeenCalledWith("/api/automation/v1/1");
      expect(result).toEqual(mockAutomation);
    });
  });

  describe("updateAutomation", () => {
    it("patches an automation with the provided body", async () => {
      const updated = { ...mockAutomation, name: "Updated Name" };
      vi.spyOn(openHands, "patch").mockResolvedValue({ data: updated });

      const result = await AutomationService.updateAutomation("1", {
        name: "Updated Name",
      });

      expect(openHands.patch).toHaveBeenCalledWith("/api/automation/v1/1", {
        name: "Updated Name",
      });
      expect(result).toEqual(updated);
    });
  });

  describe("deleteAutomation", () => {
    it("deletes an automation by id", async () => {
      vi.spyOn(openHands, "delete").mockResolvedValue({});

      await AutomationService.deleteAutomation("1");

      expect(openHands.delete).toHaveBeenCalledWith("/api/automation/v1/1");
    });
  });

  describe("listAutomationRuns", () => {
    it("fetches runs with params object", async () => {
      const response: AutomationRunsResponse = { runs: [], total: 0 };
      vi.spyOn(openHands, "get").mockResolvedValue({ data: response });

      const result = await AutomationService.listAutomationRuns("1", {
        limit: 20,
        offset: 10,
      });

      expect(openHands.get).toHaveBeenCalledWith("/api/automation/v1/1/runs", {
        params: { limit: 20, offset: 10 },
      });
      expect(result).toEqual(response);
    });

    it("uses default params when none provided", async () => {
      const response: AutomationRunsResponse = { runs: [], total: 0 };
      vi.spyOn(openHands, "get").mockResolvedValue({ data: response });

      await AutomationService.listAutomationRuns("1");

      expect(openHands.get).toHaveBeenCalledWith("/api/automation/v1/1/runs", {
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
