import { MemoryRouter } from "react-router";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test-utils";
import ConversationView from "#/routes/conversation";

const useActiveConversationMock = vi.fn();
const displayErrorToastMock = vi.fn();

vi.mock("#/hooks/use-conversation-id", () => ({
  useConversationId: () => ({ conversationId: "conversation-id" }),
}));

vi.mock("#/hooks/query/use-task-polling", () => ({
  useTaskPolling: () => ({
    isTask: false,
    taskStatus: null,
    taskDetail: null,
  }),
}));

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

vi.mock("#/hooks/query/use-is-authed", () => ({
  useIsAuthed: () => ({ data: true }),
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: (...args: unknown[]) => displayErrorToastMock(...args),
}));

describe("ConversationView error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActiveConversationMock.mockReturnValue({
      data: undefined,
      error: new Error(
        "Selected backend returned unexpected conversation data.",
      ),
      isError: true,
      isFetched: true,
    });
  });

  it("renders conversation load failures as a full-screen error instead of a toast", () => {
    renderWithProviders(
      <MemoryRouter>
        <ConversationView />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("conversation-load-error")).toBeInTheDocument();
    expect(
      screen.getByText("CONVERSATION$LOAD_ERROR_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Selected backend returned unexpected conversation data.",
      ),
    ).toBeInTheDocument();
    expect(displayErrorToastMock).not.toHaveBeenCalled();
  });
});
