import { describe, expect, it } from "vitest";
import {
  groupConversations,
  sortConversationsByField,
} from "#/components/features/conversation-panel/conversation-panel-list-helpers";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import { ExecutionStatus } from "#/types/agent-server/core";

const base: Omit<AppConversation, "id" | "title" | "workspace"> = {
  selected_repository: null,
  selected_branch: null,
  git_provider: null,
  updated_at: "2024-01-02T00:00:00.000Z",
  created_at: "2024-01-01T00:00:00.000Z",
  execution_status: ExecutionStatus.FINISHED,
  conversation_url: null,
  created_by_user_id: null,
  metrics: null,
  llm_model: null,
  trigger: null,
  pr_number: [],
  session_api_key: null,
  sandbox_id: null,
  sub_conversation_ids: [],
};

describe("conversation-panel-list-helpers", () => {
  it("sorts by updated desc", () => {
    const a: AppConversation = {
      ...base,
      id: "a",
      title: "a",
      updated_at: "2024-01-01T00:00:00.000Z",
      created_at: "2024-01-01T00:00:00.000Z",
    };
    const b: AppConversation = {
      ...base,
      id: "b",
      title: "b",
      updated_at: "2024-01-03T00:00:00.000Z",
      created_at: "2024-01-01T00:00:00.000Z",
    };
    expect(
      sortConversationsByField([a, b], "updated").map((c) => c.id),
    ).toEqual(["b", "a"]);
  });

  it("groups local conversations by normalized workspace path", () => {
    const w1: AppConversation = {
      ...base,
      id: "1",
      title: "one",
      workspace: { working_dir: "/workspace/project/foo" },
      updated_at: "2024-01-02T00:00:00.000Z",
    };
    const w2: AppConversation = {
      ...base,
      id: "2",
      title: "two",
      workspace: { working_dir: "/workspace/project/bar" },
      updated_at: "2024-01-03T00:00:00.000Z",
    };
    const none: AppConversation = {
      ...base,
      id: "3",
      title: "three",
      workspace: null,
      updated_at: "2024-01-01T00:00:00.000Z",
    };

    const groups = groupConversations([w1, w2, none], "local", "updated", {
      emptyWorkspace: "No workspace",
      emptyRepository: "No repository",
    });

    expect(groups.map((g) => g.label)).toEqual(["bar", "foo", "No workspace"]);
    expect(groups[0].conversations.map((c) => c.id)).toEqual(["2"]);
    expect(groups[1].conversations.map((c) => c.id)).toEqual(["1"]);
    expect(groups[2].conversations.map((c) => c.id)).toEqual(["3"]);
  });

  it("groups cloud conversations by repository string", () => {
    const r1: AppConversation = {
      ...base,
      id: "1",
      title: "one",
      selected_repository: "org/agent-canvas",
      updated_at: "2024-01-02T00:00:00.000Z",
    };
    const r2: AppConversation = {
      ...base,
      id: "2",
      title: "two",
      selected_repository: "org/sdk",
      updated_at: "2024-01-03T00:00:00.000Z",
    };

    const groups = groupConversations([r1, r2], "cloud", "updated", {
      emptyWorkspace: "No workspace",
      emptyRepository: "No repository",
    });

    expect(groups.map((g) => g.label)).toEqual(["sdk", "agent-canvas"]);
  });
});
