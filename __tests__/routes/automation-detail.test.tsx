import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

import AutomationService from "#/api/automation-service/automation-service.api";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import AutomationDetail from "#/routes/automation-detail";
import type { Backend } from "#/api/backend-registry/types";
import type {
  Automation,
  AutomationRunsResponse,
} from "#/types/automation";

vi.mock("#/api/automation-service/automation-service.api", () => ({
  default: {
    getAutomation: vi.fn(),
    getAutomationRuns: vi.fn(),
    toggleAutomation: vi.fn(),
    deleteAutomation: vi.fn(),
    checkHealth: vi.fn(),
  },
}));

const localBackend: Backend = {
  id: "local-1",
  name: "Local 1",
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

const automation: Automation = {
  id: "auto-1",
  name: "Test Automation",
  prompt: "p",
  trigger: { type: "schedule", schedule_human: "Daily" },
  enabled: true,
  repository: "acme/repo",
  model: "Claude",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const emptyRuns: AutomationRunsResponse = { runs: [], total: 0 };

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>
        <MemoryRouter initialEntries={["/automations/auto-1"]}>
          <Routes>
            <Route
              path="/automations/:automationId"
              element={<AutomationDetail />}
            />
          </Routes>
        </MemoryRouter>
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.mocked(AutomationService.checkHealth).mockReset();
  vi.mocked(AutomationService.checkHealth).mockResolvedValue({ status: "ok" });
  vi.mocked(AutomationService.getAutomation).mockReset();
  vi.mocked(AutomationService.getAutomation).mockResolvedValue(automation);
  vi.mocked(AutomationService.getAutomationRuns).mockReset();
  vi.mocked(AutomationService.getAutomationRuns).mockResolvedValue(emptyRuns);
  setRegisteredBackends([localBackend, cloudBackend]);
  setActiveSelection({ backendId: localBackend.id });
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("AutomationDetail — backend-change guard", () => {
  it("does not fetch the automation again when the active backend changes after mount", async () => {
    // Arrange — the page mounts under the local backend; the id in the URL
    // refers to a local-only automation. Wait for the initial fetch.
    renderDetail();
    await waitFor(() => {
      expect(AutomationService.getAutomation).toHaveBeenCalledTimes(1);
    });
    expect(AutomationService.getAutomation).toHaveBeenLastCalledWith("auto-1");

    // Act — flip the active backend to cloud while the detail page is
    // still mounted (the BackendSelector's redirect lands on the next
    // tick; the guard must prevent any fetch in this window).
    setActiveSelection({ backendId: cloudBackend.id });

    // Assert — no second fetch for the now-stale local id is made.
    // Give react-query a chance to react to the key change before
    // asserting.
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(AutomationService.getAutomation).toHaveBeenCalledTimes(1);
  });
});
