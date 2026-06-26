import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkConversationToolsBar } from "#/components/features/work/work-conversation-tools-bar";

const updateTools = vi.fn();
const applyResult = vi.fn();
const setDismissed = vi.fn();
const useLocalStorageMock = vi.fn(() => [false, setDismissed]);

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => ({
    data: {
      id: "conv-1",
      tags: { appmode: "work", worktools: "" },
      conversation_url: "http://localhost:8000",
      session_api_key: "key",
    },
  }),
}));

vi.mock("#/hooks/mutation/use-update-work-conversation-tools", () => ({
  useUpdateWorkConversationTools: () => ({
    mutateAsync: updateTools,
    isPending: false,
  }),
}));

vi.mock("#/hooks/use-apply-work-tool-result", () => ({
  useApplyWorkToolResult: () => applyResult,
}));

vi.mock("#/api/agent-server-compatibility", () => ({
  isAgentServerToolAvailable: () => true,
}));

vi.mock("@uidotdev/usehooks", () => ({
  useLocalStorage: useLocalStorageMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("WorkConversationToolsBar", () => {
  beforeEach(() => {
    updateTools.mockReset();
    applyResult.mockReset();
    setDismissed.mockReset();
    useLocalStorageMock.mockReturnValue([false, setDismissed]);
    window.localStorage.clear();
  });

  it("renders pending optional tools in a compact row", () => {
    render(<WorkConversationToolsBar />);

    expect(screen.getByTestId("work-conversation-tools-bar")).toBeInTheDocument();
    expect(screen.getByTestId("work-conversation-tool-browser")).toBeInTheDocument();
    expect(
      screen.queryByText("WORK$TOOLS_CONVERSATION_BODY"),
    ).not.toBeInTheDocument();
  });

  it("hides when dismissed", () => {
    useLocalStorageMock.mockReturnValue([true, setDismissed]);

    render(<WorkConversationToolsBar />);

    expect(
      screen.queryByTestId("work-conversation-tools-bar"),
    ).not.toBeInTheDocument();
  });

  it("calls dismiss handler when close is clicked", () => {
    render(<WorkConversationToolsBar />);
    fireEvent.click(screen.getByTestId("work-conversation-tools-dismiss"));

    expect(setDismissed).toHaveBeenCalledWith(true);
  });
});
