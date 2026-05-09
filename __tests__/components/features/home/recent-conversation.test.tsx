import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import { RecentConversation } from "#/components/features/home/recent-conversations/recent-conversation";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import { ExecutionStatus } from "#/types/agent-server/core";

vi.mock("react-i18next", async () => {
  const actual = await vi.importActual("react-i18next");
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const translations: Record<string, string> = {
          CONVERSATION$AGO: "ago",
          COMMON$NO_REPOSITORY: "No repository",
        };
        return translations[key] || key;
      },
      i18n: {
        changeLanguage: () => new Promise(() => {}),
      },
    }),
  };
});

const baseConversation: AppConversation = {
  id: "test-id",
  title: "Test Conversation",
  execution_status: ExecutionStatus.RUNNING,
  updated_at: "2021-10-01T12:00:00Z",
  created_at: "2021-10-01T12:00:00Z",
  selected_repository: null,
  selected_branch: null,
  git_provider: null,
  conversation_url: null,
  created_by_user_id: "user1",
  metrics: null,
  llm_model: null,
  trigger: null,
  pr_number: [],
  session_api_key: null,
  sandbox_id: null,
  sub_conversation_ids: [],
};

const renderRecentConversation = (conversation: AppConversation) =>
  renderWithProviders(<RecentConversation conversation={conversation} />);

describe("RecentConversation - llm_model", () => {
  it("should not render the llm model even when provided", () => {
    renderRecentConversation({
      ...baseConversation,
      llm_model: "anthropic/claude-sonnet-4-20250514",
    });

    expect(
      screen.queryByTestId("recent-conversation-llm-model"),
    ).not.toBeInTheDocument();
  });
});
