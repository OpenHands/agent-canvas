import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

import { I18nKey } from "#/i18n/declaration";

import AutomationService from "#/api/automation-service/automation-service.api";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import AutomationsList from "#/routes/automations-list";
import type { Backend } from "#/api/backend-registry/types";
import type { Automation, AutomationsResponse } from "#/types/automation";

vi.mock("#/api/automation-service/automation-service.api", () => ({
  default: {
    getAutomations: vi.fn(),
    updateAutomation: vi.fn(),
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
  name: "Daily digest",
  prompt: "Summarize yesterday's PRs",
  trigger: { type: "cron", schedule: "0 9 * * *", schedule_human: "Daily" },
  enabled: true,
  repository: "acme/repo",
  model: "daily-profile",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const listResponse: AutomationsResponse = {
  automations: [automation],
  total: 1,
};

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>
        <MemoryRouter initialEntries={["/automations"]}>
          <AutomationsList />
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
  vi.mocked(AutomationService.getAutomations).mockReset();
  vi.mocked(AutomationService.getAutomations).mockResolvedValue(listResponse);
  vi.mocked(AutomationService.updateAutomation).mockReset();
  setRegisteredBackends([localBackend, cloudBackend]);
  setActiveSelection({ backendId: localBackend.id });
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("AutomationsList — Edit from the row kebab is local-only", () => {
  it("opens the Edit modal pre-filled with the row's values when the active backend is local", async () => {
    // Arrange — local backend is active (default beforeEach); render the list
    // and wait for the row to appear.
    const user = userEvent.setup();
    renderList();
    await waitFor(() => {
      expect(AutomationService.getAutomations).toHaveBeenCalledTimes(1);
    });
    await screen.findByText(automation.name);

    // Act — open the row kebab and pick Edit. The aria-label resolves to
    // the I18n key in tests because `t` is mocked to return the key itself.
    await user.click(screen.getByLabelText(I18nKey.AUTOMATIONS$ACTIONS_MENU));
    await user.click(
      screen.getByRole("button", { name: I18nKey.AUTOMATIONS$EDIT }),
    );

    // Assert — the shared Edit modal mounts wired to this row (name input is
    // pre-filled with that row's name, proving the list page passed the right
    // automation through).
    const nameInput = (await screen.findByTestId(
      "edit-automation-name",
    )) as HTMLInputElement;
    expect(nameInput.value).toBe(automation.name);
  });

  it("hides Edit in the row kebab when the active backend is cloud", async () => {
    // Arrange — switch to the cloud backend before mounting so the page sees
    // it as the active backend on first render.
    setActiveSelection({ backendId: cloudBackend.id });
    const user = userEvent.setup();
    renderList();
    await waitFor(() => {
      expect(AutomationService.getAutomations).toHaveBeenCalledTimes(1);
    });
    await screen.findByText(automation.name);

    // Act — open the row kebab. The aria-label resolves to the I18n key
    // in tests because `t` is mocked to return the key itself.
    await user.click(screen.getByLabelText(I18nKey.AUTOMATIONS$ACTIONS_MENU));

    // Assert — Edit must not appear on cloud; Delete still does, proving the
    // menu actually opened and we didn't merely fail to render it.
    expect(
      screen.queryByRole("button", { name: I18nKey.AUTOMATIONS$EDIT }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: I18nKey.AUTOMATIONS$DELETE }),
    ).toBeInTheDocument();
  });
});

describe("AutomationsList — view mode toggle", () => {
  it("switches saved automations from cards to table rows", async () => {
    const user = userEvent.setup();
    renderList();
    await waitFor(() => {
      expect(AutomationService.getAutomations).toHaveBeenCalledTimes(1);
    });
    await screen.findByTestId("automation-card-auto-1");

    await user.click(screen.getByTestId("automations-view-toggle"));
    await user.click(screen.getByTestId("automations-view-toggle-list"));

    expect(
      screen.queryByTestId("automation-card-auto-1"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("automation-list-row-auto-1")).toBeInTheDocument();
    expect(window.localStorage.getItem("openhands-automations-view")).toBe(
      "list",
    );
  });

  it("disables the view-mode toggle when the user has no automations", async () => {
    // Arrange — service returns an empty list, so the page lands on EmptyState.
    vi.mocked(AutomationService.getAutomations).mockResolvedValue({
      automations: [],
      total: 0,
    });
    const user = userEvent.setup();
    renderList();
    await waitFor(() => {
      expect(AutomationService.getAutomations).toHaveBeenCalledTimes(1);
    });

    // Act — try to open the toggle's grid/list menu.
    const trigger = await screen.findByTestId("automations-view-toggle");
    await user.click(trigger);

    // Assert — toggle is disabled and clicking it does not reveal the menu.
    expect(trigger).toBeDisabled();
    expect(
      screen.queryByTestId("automations-view-toggle-list"),
    ).not.toBeInTheDocument();
  });
});
