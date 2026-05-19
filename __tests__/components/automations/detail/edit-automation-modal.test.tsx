import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EditAutomationModal } from "#/components/features/automations/detail/edit-automation-modal";
import AutomationService from "#/api/automation-service/automation-service.api";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";
import type { Automation } from "#/types/automation";
import type { Backend } from "#/api/backend-registry/types";

vi.mock("#/api/automation-service/automation-service.api", () => ({
  default: {
    updateAutomation: vi.fn(),
  },
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: vi.fn(),
  displayErrorToast: vi.fn(),
}));

const localBackend: Backend = {
  id: "local-1",
  name: "Local",
  host: "http://localhost:8000",
  apiKey: "session-key",
  kind: "local",
};

const dailyAutomation: Automation = {
  id: "auto-1",
  name: "Daily digest",
  prompt: "Summarize yesterday's PRs",
  trigger: { type: "cron", schedule: "0 9 * * *" },
  enabled: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  timezone: "America/Los_Angeles",
};

const customAutomation: Automation = {
  ...dailyAutomation,
  id: "auto-2",
  name: "Twice daily",
  trigger: { type: "cron", schedule: "0 9,17 * * *" },
};

function renderModal(automation: Automation) {
  const onClose = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>
        <EditAutomationModal
          automation={automation}
          isOpen
          onClose={onClose}
        />
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
  return { ...utils, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetActiveStoreForTests();
  setRegisteredBackends([localBackend]);
  setActiveSelection({ backendId: localBackend.id });
});

describe("EditAutomationModal", () => {
  it("pre-fills current values and PATCHes only the fields that changed", async () => {
    // Arrange — daily automation at 09:00 with a known prompt. The
    // backend will echo back the merged result.
    vi.mocked(AutomationService.updateAutomation).mockResolvedValue({
      ...dailyAutomation,
      name: "Morning digest",
      prompt: "Summarize today's open PRs",
      trigger: { type: "cron", schedule: "30 10 * * *" },
    });
    const user = userEvent.setup();
    const { onClose } = renderModal(dailyAutomation);

    // Sanity-check pre-fill: the inputs reflect the existing automation
    // before the user edits anything.
    const nameInput = screen.getByTestId(
      "edit-automation-name",
    ) as HTMLInputElement;
    const timeInput = screen.getByTestId(
      "edit-automation-time",
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("Daily digest");
    expect(timeInput.value).toBe("09:00");

    // Act — change name, prompt, and time; leave frequency at Daily.
    await user.clear(nameInput);
    await user.type(nameInput, "Morning digest");
    const promptInput = screen.getByTestId("edit-automation-prompt");
    await user.clear(promptInput);
    await user.type(promptInput, "Summarize today's open PRs");
    await user.clear(timeInput);
    await user.type(timeInput, "10:30");
    await user.click(screen.getByTestId("edit-automation-save"));

    // Assert — PATCH body contains exactly the diff (no untouched
    // fields like enabled/repository), and the success path closes
    // the modal + toasts the user.
    await waitFor(() => {
      expect(AutomationService.updateAutomation).toHaveBeenCalledTimes(1);
    });
    expect(AutomationService.updateAutomation).toHaveBeenCalledWith("auto-1", {
      name: "Morning digest",
      prompt: "Summarize today's open PRs",
      trigger: { type: "cron", schedule: "30 10 * * *" },
    });
    await waitFor(() => {
      expect(displaySuccessToast).toHaveBeenCalledTimes(1);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("blocks submit and shows a validation error when the name is empty", async () => {
    // Arrange
    const user = userEvent.setup();
    renderModal(dailyAutomation);

    // Act — clear the name and try to save.
    const nameInput = screen.getByTestId("edit-automation-name");
    await user.clear(nameInput);
    await user.click(screen.getByTestId("edit-automation-save"));

    // Assert — no PATCH fired, inline error appears.
    expect(AutomationService.updateAutomation).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("edit-automation-name-error"),
    ).toBeInTheDocument();
  });

  it("renders custom-schedule hint and skips schedule mutation for non-preset cron", async () => {
    // Arrange — schedule "0 9,17 * * *" is not a Daily/Weekdays/Weekly
    // preset; the modal must treat it as read-only for frequency but
    // still allow editing the prompt/name.
    vi.mocked(AutomationService.updateAutomation).mockResolvedValue(
      customAutomation,
    );
    const user = userEvent.setup();
    renderModal(customAutomation);

    // The hint surfaces so the user understands why frequency is
    // disabled; this is the user-visible signal that we're in
    // custom mode.
    expect(screen.getByTestId("custom-schedule-hint")).toBeInTheDocument();

    // Act — change only the name and save.
    const nameInput = screen.getByTestId("edit-automation-name");
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed");
    await user.click(screen.getByTestId("edit-automation-save"));

    // Assert — the PATCH body does NOT include a trigger override, so
    // the user's hand-tuned cron is preserved.
    await waitFor(() => {
      expect(AutomationService.updateAutomation).toHaveBeenCalledTimes(1);
    });
    const [, body] = vi.mocked(AutomationService.updateAutomation).mock
      .calls[0];
    expect(body).not.toHaveProperty("trigger");
    expect(body).toMatchObject({ name: "Renamed" });
  });

  it("surfaces an error toast and keeps the modal open when the update fails", async () => {
    // Arrange — backend rejects the PATCH.
    vi.mocked(AutomationService.updateAutomation).mockRejectedValue(
      new Error("backend down"),
    );
    const user = userEvent.setup();
    const { onClose } = renderModal(dailyAutomation);

    // Act — change the time to force a non-empty diff, then save.
    const timeInput = screen.getByTestId("edit-automation-time");
    await user.clear(timeInput);
    await user.type(timeInput, "10:30");
    await user.click(screen.getByTestId("edit-automation-save"));

    // Assert — error toast fired, modal stays open.
    await waitFor(() => {
      expect(displayErrorToast).toHaveBeenCalledTimes(1);
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
