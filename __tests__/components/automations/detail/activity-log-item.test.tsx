import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

import { ActivityLogItem } from "#/components/features/automations/detail/activity-log-item";
import {
  AutomationRunStatus,
  type AutomationRun,
} from "#/types/automation";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import type { Backend } from "#/api/backend-registry/types";
import { I18nKey } from "#/i18n/declaration";

// In tests the i18n backend doesn't resolve translation values, so the
// aria-label resolves to the raw key string. Match it explicitly.
const LOGS_BUTTON_NAME = (name: string) =>
  name.includes(I18nKey.AUTOMATIONS$DETAIL$LOGS_VIEW);

// The modal is wired to react-query + the conversation lookup. The
// ActivityLogItem tests focus on the trigger button; we mock the modal so
// they don't need to bring up the entire query stack.
vi.mock(
  "#/components/features/automations/detail/run-logs-modal",
  () => ({
    RunLogsModal: ({
      isOpen,
      onClose,
      bashCommandId,
    }: {
      isOpen: boolean;
      onClose: () => void;
      bashCommandId: string | null;
    }) =>
      isOpen ? (
        <div data-testid="logs-modal" data-bash-command-id={bashCommandId}>
          <button type="button" onClick={onClose}>
            close
          </button>
        </div>
      ) : null,
  }),
);

const localBackend: Backend = {
  id: "local-1",
  name: "Local 1",
  host: "http://localhost:8000",
  apiKey: "k",
  kind: "local",
};

function makeRun(overrides: Partial<AutomationRun> = {}): AutomationRun {
  return {
    id: "run-1",
    status: AutomationRunStatus.COMPLETED,
    conversation_id: "conv-1",
    bash_command_id: "cmd-1",
    error_detail: null,
    started_at: "2026-01-01T10:00:00Z",
    completed_at: "2026-01-01T10:02:00Z",
    ...overrides,
  };
}

function renderItem(run: AutomationRun) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>
        <MemoryRouter>
          <ActivityLogItem run={run} />
        </MemoryRouter>
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

describe("ActivityLogItem — logs button", () => {
  beforeEach(() => {
    __resetActiveStoreForTests();
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });
  });

  afterEach(() => {
    __resetActiveStoreForTests();
  });

  it("renders a logs button when the run has a bash_command_id", () => {
    renderItem(makeRun());
    // Use the short tooltip label to find the button.
    expect(
      screen.getByRole("button", { name: LOGS_BUTTON_NAME }),
    ).toBeInTheDocument();
  });

  it("does not render a logs button when bash_command_id is null", () => {
    renderItem(makeRun({ bash_command_id: null }));
    expect(
      screen.queryByRole("button", { name: LOGS_BUTTON_NAME }),
    ).not.toBeInTheDocument();
  });

  it("opens the logs modal when the button is clicked and passes the bash_command_id through", () => {
    renderItem(makeRun({ bash_command_id: "cmd-xyz" }));

    expect(screen.queryByTestId("logs-modal")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: LOGS_BUTTON_NAME }));

    const modal = screen.getByTestId("logs-modal");
    expect(modal).toBeInTheDocument();
    expect(modal.getAttribute("data-bash-command-id")).toBe("cmd-xyz");
  });

  it("renders the logs button inside the row link without breaking its href", () => {
    renderItem(makeRun({ conversation_id: "conv-abc" }));

    const link = screen.getByRole("link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/conversations/conv-abc");
    // The button lives inside the link, so the click handler must
    // preventDefault + stopPropagation (implementation contract verified
    // by the modal-opens test above) to avoid following the link.
    expect(
      link.contains(screen.getByRole("button", { name: LOGS_BUTTON_NAME })),
    ).toBe(true);
  });
});
