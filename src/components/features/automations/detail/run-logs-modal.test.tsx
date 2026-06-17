import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RunLogsModal } from "./run-logs-modal";
import { useBashCommandLogs } from "#/hooks/query/use-bash-command-logs";

vi.mock("#/hooks/query/use-bash-command-logs", () => ({
  useBashCommandLogs: vi.fn(),
}));

const mockUseBashCommandLogs = vi.mocked(useBashCommandLogs);

describe("RunLogsModal", () => {
  it("appends automation error detail without replacing fetched output", () => {
    mockUseBashCommandLogs.mockReturnValue({
      data: [
        {
          id: "output-1",
          command_id: "cmd-1",
          bash_command_id: "cmd-1",
          order: 0,
          stdout: "existing stdout\n",
          stderr: "",
          timestamp: "2026-06-15T17:00:34.000Z",
        },
      ],
      error: null,
      isFetching: false,
      isPending: false,
      isResolvingConversation: false,
      conversationMissing: false,
      sandboxIssue: null,
    });

    render(
      <RunLogsModal
        conversationId="conv-1"
        bashCommandId="cmd-1"
        errorDetail={"Timed out: command timed out or was killed\nstderr log"}
        isOpen
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId("run-logs-output-stdout")).toHaveTextContent(
      "existing stdout",
    );
    expect(screen.getByTestId("run-logs-error-detail")).toHaveTextContent(
      "AUTOMATIONS$DETAIL$LOGS_ERROR_DETAIL",
    );
    expect(screen.getByTestId("run-logs-error-detail")).toHaveTextContent(
      "Timed out: command timed out or was killed",
    );
    expect(screen.getByTestId("run-logs-error-detail")).toHaveTextContent(
      "stderr log",
    );
  });
});
