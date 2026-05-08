import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoutesStub } from "react-router";
import { RecentConversations } from "#/components/features/home/recent-conversations/recent-conversations";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";

const renderRecentConversations = () => {
  const RouterStub = createRoutesStub([
    {
      Component: () => <RecentConversations />,
      path: "/",
    },
  ]);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<RouterStub />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
};

describe("RecentConversations", () => {
  const searchConversationsSpy = vi.spyOn(
    AgentServerConversationService,
    "searchConversations",
  );

  it("should not show empty state when there is an error", async () => {
    searchConversationsSpy.mockRejectedValue(
      new Error("Failed to fetch conversations"),
    );

    renderRecentConversations();

    // Wait for the error to be displayed
    await waitFor(() => {
      expect(
        screen.getByText("Failed to fetch conversations"),
      ).toBeInTheDocument();
    });

    // The empty state should NOT be displayed when there's an error
    expect(
      screen.queryByText("HOME$NO_RECENT_CONVERSATIONS"),
    ).not.toBeInTheDocument();
  });
});
