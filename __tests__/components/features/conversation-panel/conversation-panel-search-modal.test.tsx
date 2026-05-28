import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "i18next";
import { ConversationPanelSearchModal } from "#/components/features/conversation-panel/conversation-panel-search-modal";
import { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import { ExecutionStatus } from "#/types/agent-server/core";

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

describe("ConversationPanelSearchModal", () => {
  it("renders nothing when closed", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ConversationPanelSearchModal
          isOpen={false}
          onClose={vi.fn()}
          conversations={[]}
          onSelectConversation={vi.fn()}
        />
      </I18nextProvider>,
    );

    expect(
      screen.queryByTestId("conversation-panel-search-modal"),
    ).not.toBeInTheDocument();
  });

  it("filters results and selects a conversation", async () => {
      const user = userEvent.setup();
      const onSelectConversation = vi.fn();
      const conversations = [
        createMockConversation({ id: "1", title: "Alpha task" }),
        createMockConversation({ id: "2", title: "Beta figma export" }),
      ];

      render(
        <I18nextProvider i18n={i18n}>
          <ConversationPanelSearchModal
            isOpen
            onClose={vi.fn()}
            conversations={conversations}
            onSelectConversation={onSelectConversation}
          />
        </I18nextProvider>,
      );

      const modal = screen.getByTestId("conversation-panel-search-modal");
      expect(
        screen.getByTestId("conversation-panel-search-section-label"),
      ).toBeInTheDocument();

      await user.type(
        screen.getByTestId("conversation-panel-search-input"),
        "figma",
      );

      expect(
        screen.queryByTestId("conversation-panel-search-section-label"),
      ).not.toBeInTheDocument();
      expect(
        within(modal).getAllByTestId("conversation-panel-search-result"),
      ).toHaveLength(1);

      await user.click(within(modal).getByTestId("conversation-panel-search-result"));
      expect(onSelectConversation).toHaveBeenCalledWith("2");
    });

  it("renders a timestamp on the far right of each result", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ConversationPanelSearchModal
          isOpen
          onClose={vi.fn()}
          conversations={[
            createMockConversation({
              id: "1",
              updated_at: "2026-01-01T00:00:00.000Z",
            }),
          ]}
          onSelectConversation={vi.fn()}
        />
      </I18nextProvider>,
    );

    expect(
      screen.getByTestId("conversation-panel-search-result-timestamp"),
    ).toBeInTheDocument();
  });
});
