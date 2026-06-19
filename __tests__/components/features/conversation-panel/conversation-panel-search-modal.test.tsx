import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "i18next";
import { ConversationPanelSearchModal } from "#/components/features/conversation-panel/conversation-panel-search-modal";
import { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import { ExecutionStatus } from "#/types/agent-server/core";
import * as searchMatchingConversationsModule from "#/api/conversation-service/search-matching-conversations";

const createMockConversation = (
  overrides: Partial<AppConversation> = {},
): AppConversation => ({
  id: "1",
  title: "Review the project",
  selected_repository: "org/repo",
  git_provider: null,
  selected_branch: "main",
  updated_at: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
  execution_status: ExecutionStatus.FINISHED,
  conversation_url: null,
  created_by_user_id: "user",
  metrics: null,
  llm_model: null,
  trigger: null,
  pr_number: [],
  session_api_key: null,
  sandbox_id: null,
  sub_conversation_ids: [],
  ...overrides,
});

function renderModal(
  props: Partial<React.ComponentProps<typeof ConversationPanelSearchModal>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ConversationPanelSearchModal
          isOpen
          onClose={vi.fn()}
          onSelectConversation={vi.fn()}
          {...props}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("ConversationPanelSearchModal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when closed", () => {
    renderModal({ isOpen: false });

    expect(
      screen.queryByTestId("conversation-panel-search-modal"),
    ).not.toBeInTheDocument();
  });

  it("filters results via server search and selects a conversation", async () => {
    const user = userEvent.setup();
    const onSelectConversation = vi.fn();
    const conversations = [
      createMockConversation({ id: "1", title: "Alpha task" }),
      createMockConversation({ id: "2", title: "Beta figma export" }),
    ];

    vi.spyOn(
      searchMatchingConversationsModule,
      "searchMatchingConversations",
    ).mockImplementation(async (query) => {
      const trimmed = query.trim().toLowerCase();
      if (!trimmed) {
        return conversations;
      }
      return conversations.filter((conversation) =>
        conversation.title?.toLowerCase().includes(trimmed),
      );
    });

    renderModal({ onSelectConversation });

    const modal = await screen.findByTestId("conversation-panel-search-modal");
    expect(
      screen.getByTestId("conversation-panel-search-section-label"),
    ).toBeInTheDocument();

    await user.type(
      screen.getByTestId("conversation-panel-search-input"),
      "figma",
    );

    await waitFor(() => {
      expect(
        within(modal).getAllByTestId("conversation-panel-search-result"),
      ).toHaveLength(1);
    });

    expect(
      screen.queryByTestId("conversation-panel-search-section-label"),
    ).not.toBeInTheDocument();

    await user.click(within(modal).getByTestId("conversation-panel-search-result"));
    expect(onSelectConversation).toHaveBeenCalledWith("2");
  });

  it("renders a timestamp on the far right of each result", async () => {
    vi.spyOn(
      searchMatchingConversationsModule,
      "searchMatchingConversations",
    ).mockResolvedValue([
      createMockConversation({
        id: "1",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
    ]);

    renderModal();

    expect(
      await screen.findByTestId("conversation-panel-search-result-timestamp"),
    ).toBeInTheDocument();
  });
});
