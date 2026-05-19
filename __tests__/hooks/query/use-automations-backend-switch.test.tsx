import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AutomationService from "#/api/automation-service/automation-service.api";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import {
  useAutomations,
  useDispatchAutomation,
} from "#/hooks/query/use-automations";
import { useAutomationDetail } from "#/hooks/query/use-automation-detail";
import type { Backend } from "#/api/backend-registry/types";
import { AutomationRunStatus } from "#/types/automation";
import type {
  Automation,
  AutomationRun,
  AutomationsResponse,
} from "#/types/automation";

vi.mock("#/api/automation-service/automation-service.api", () => ({
  default: {
    getAutomations: vi.fn(),
    getAutomation: vi.fn(),
    dispatchAutomation: vi.fn(),
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
  name: "Test",
  prompt: "p",
  trigger: { type: "schedule", schedule_human: "Daily" },
  enabled: true,
  repository: "acme/repo",
  model: "daily-profile",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const automationRun: AutomationRun = {
  id: "run-1",
  status: AutomationRunStatus.PENDING,
  conversation_id: null,
  bash_command_id: null,
  error_detail: null,
  started_at: "2026-01-02T00:00:00Z",
  completed_at: null,
};

const listResponse: AutomationsResponse = {
  automations: [automation],
  total: 1,
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.mocked(AutomationService.getAutomations).mockReset();
  vi.mocked(AutomationService.getAutomation).mockReset();
  vi.mocked(AutomationService.dispatchAutomation).mockReset();
  vi.mocked(AutomationService.dispatchAutomation).mockResolvedValue(
    automationRun,
  );

  vi.mocked(AutomationService.getAutomations).mockResolvedValue(listResponse);
  vi.mocked(AutomationService.getAutomation).mockResolvedValue(automation);
  setRegisteredBackends([localBackend, cloudBackend]);
  setActiveSelection({ backendId: localBackend.id });
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("automation hooks — backend switch", () => {
  it("useAutomations refetches when the active backend changes", async () => {
    // Arrange — mount under the local backend; capture the initial fetch.
    const { result } = renderHook(
      () => useAutomations({ limit: 50, offset: 0 }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(AutomationService.getAutomations).toHaveBeenCalledTimes(1);

    // Act — flip the active backend to a cloud one.
    setActiveSelection({ backendId: cloudBackend.id });

    // Assert — react-query treats the new (backend, org) as a brand-new
    // query (the key includes active.backend.id + active.orgId), so a
    // second fetch fires automatically without any explicit invalidate.
    await waitFor(() => {
      expect(AutomationService.getAutomations).toHaveBeenCalledTimes(2);
    });
  });

  it("useAutomationDetail refetches when the active backend changes", async () => {
    const { result } = renderHook(() => useAutomationDetail({ id: "auto-1" }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(AutomationService.getAutomation).toHaveBeenCalledTimes(1);

    setActiveSelection({ backendId: cloudBackend.id });

    await waitFor(() => {
      expect(AutomationService.getAutomation).toHaveBeenCalledTimes(2);
    });
  });

  it("useDispatchAutomation dispatches the selected automation", async () => {
    const { result } = renderHook(() => useDispatchAutomation(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync("auto-1");
    });

    expect(AutomationService.dispatchAutomation).toHaveBeenCalledWith("auto-1");
  });
});
