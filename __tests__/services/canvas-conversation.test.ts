import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AppConversation,
  AppConversationStartTask,
} from "#/api/conversation-service/agent-server-conversation-service.types";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import {
  getStoredConversationMetadata,
  setStoredConversationMetadata,
} from "#/api/conversation-metadata-store";
import { setQueryClient } from "#/query-client-config";
import { handleCanvasConversationAction } from "#/services/canvas-conversation";
import type { CanvasConversationAction } from "#/types/agent-server/core";

const { invalidateQueries, displaySuccessToast, displayErrorToast } =
  vi.hoisted(() => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    displaySuccessToast: vi.fn(),
    displayErrorToast: vi.fn(),
  }));

vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({
    default: {
      batchGetAppConversations: vi.fn(),
      createConversation: vi.fn(),
    },
  }),
);

vi.mock("#/query-client-config", async () => {
  const actual = await vi.importActual<typeof import("#/query-client-config")>(
    "#/query-client-config",
  );
  return {
    ...actual,
    queryClient: { invalidateQueries },
  };
});

vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast,
  displayErrorToast,
}));

function action(prompt: string): CanvasConversationAction {
  return {
    kind: "CanvasConversationAction",
    command: "create_child_conversation",
    prompt,
  };
}

function makeParentConversation(
  overrides: Partial<AppConversation> = {},
): AppConversation {
  return {
    id: "parent-conv",
    created_by_user_id: null,
    selected_repository: null,
    selected_branch: null,
    git_provider: null,
    title: "Parent",
    trigger: null,
    pr_number: [],
    llm_model: "gpt-5.5",
    metrics: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    execution_status: null,
    sandbox_status: null,
    conversation_url: "http://localhost:3000/api/conversations/parent-conv",
    session_api_key: null,
    sandbox_id: null,
    workspace: { working_dir: "/workspace/project/shared-dir" },
    sub_conversation_ids: [],
    ...overrides,
  };
}

function makeStartTask(
  overrides: Partial<AppConversationStartTask> = {},
): AppConversationStartTask {
  return {
    id: "task-123",
    created_by_user_id: null,
    status: "READY",
    detail: null,
    app_conversation_id: "child-conv",
    agent_server_url: "http://localhost:3000",
    request: {
      initial_message: null,
      parent_conversation_id: null,
      agent_type: "default",
      sandbox_id: null,
      plugins: null,
    },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("handleCanvasConversationAction", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    setQueryClient(null);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("creates a fresh local child conversation in the parent's working directory and preserves attached-workspace metadata semantics", async () => {
    const parent = makeParentConversation();
    const child = makeStartTask();

    setStoredConversationMetadata("parent-conv", {
      selected_repository: null,
      selected_branch: null,
      git_provider: null,
      selected_workspace: null,
      active_profile: "profile-a",
    });

    vi.mocked(
      AgentServerConversationService.batchGetAppConversations,
    ).mockResolvedValue([parent]);
    vi.mocked(
      AgentServerConversationService.createConversation,
    ).mockResolvedValue(child);

    await handleCanvasConversationAction(
      action("Investigate the bug in fresh context."),
      "parent-conv",
    );

    expect(
      AgentServerConversationService.createConversation,
    ).toHaveBeenCalledWith(
      "Investigate the bug in fresh context.",
      undefined,
      undefined,
      null,
      "/workspace/project/shared-dir",
      undefined,
      undefined,
      undefined,
    );

    expect(getStoredConversationMetadata("child-conv")).toEqual({
      selected_repository: null,
      selected_branch: null,
      git_provider: null,
      selected_workspace: null,
      active_profile: "profile-a",
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["user", "conversations"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["start-tasks"],
    });
    expect(displaySuccessToast).toHaveBeenCalledTimes(1);
  });

  it("reuses the parent's sandbox for cloud-style fresh child conversations without passing a parent id", async () => {
    const parent = makeParentConversation({
      selected_repository: "OpenHands/agent-canvas",
      selected_branch: "main",
      git_provider: "github",
      sandbox_id: "sandbox-9",
    });

    vi.mocked(
      AgentServerConversationService.batchGetAppConversations,
    ).mockResolvedValue([parent]);
    vi.mocked(
      AgentServerConversationService.createConversation,
    ).mockResolvedValue(
      makeStartTask({ app_conversation_id: null, status: "WORKING" }),
    );

    await handleCanvasConversationAction(
      action("Take over this task."),
      "parent-conv",
    );

    expect(
      AgentServerConversationService.createConversation,
    ).toHaveBeenCalledWith(
      "Take over this task.",
      undefined,
      undefined,
      {
        selected_repository: "OpenHands/agent-canvas",
        selected_branch: "main",
        git_provider: "github",
      },
      "/workspace/project/shared-dir",
      undefined,
      undefined,
      "sandbox-9",
    );
  });

  it("ignores empty prompts without calling the API", async () => {
    await handleCanvasConversationAction(action("   "), "parent-conv");

    expect(
      AgentServerConversationService.batchGetAppConversations,
    ).not.toHaveBeenCalled();
    expect(
      AgentServerConversationService.createConversation,
    ).not.toHaveBeenCalled();
  });
});
