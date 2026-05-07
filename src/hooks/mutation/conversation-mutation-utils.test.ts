import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { updateConversationExecutionStatusInCache } from "./conversation-mutation-utils";
import { V1ExecutionStatus } from "#/types/v1/core/base/common";
import { V1AppConversation } from "#/api/conversation-service/v1-conversation-service.types";

const createConversation = (): V1AppConversation => ({
  id: "conversation-1",
  created_by_user_id: null,
  selected_repository: null,
  selected_branch: null,
  git_provider: null,
  title: "Test conversation",
  trigger: null,
  pr_number: [],
  llm_model: null,
  metrics: null,
  created_at: "2026-04-16T00:00:00Z",
  updated_at: "2026-04-16T00:00:00Z",
  execution_status: V1ExecutionStatus.RUNNING,
  conversation_url: "http://localhost:3000/api/conversations/conversation-1",
  session_api_key: "session-key",
  sandbox_id: null,
  sub_conversation_ids: [],
});

describe("updateConversationExecutionStatusInCache", () => {
  it("updates the active conversation execution_status field", () => {
    const queryClient = new QueryClient();
    const conversation = createConversation();

    queryClient.setQueryData(
      ["user", "conversation", conversation.id],
      conversation,
    );

    updateConversationExecutionStatusInCache(
      queryClient,
      conversation.id,
      V1ExecutionStatus.PAUSED,
    );

    expect(
      queryClient.getQueryData<V1AppConversation | null>([
        "user",
        "conversation",
        conversation.id,
      ]),
    ).toMatchObject({
      execution_status: V1ExecutionStatus.PAUSED,
    });
  });
});
