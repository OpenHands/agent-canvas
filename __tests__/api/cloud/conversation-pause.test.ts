import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import { pauseConversation } from "#/hooks/mutation/conversation-mutation-utils";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";

vi.mock("axios");

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

const buildConversation = (
  overrides: Partial<AppConversation> = {},
): AppConversation => ({
  id: "conv-abc",
  created_by_user_id: null,
  selected_repository: null,
  selected_branch: null,
  git_provider: null,
  title: "Test",
  trigger: null,
  pr_number: [],
  llm_model: null,
  metrics: null,
  created_at: "2026-04-16T00:00:00Z",
  updated_at: "2026-04-16T00:00:00Z",
  execution_status: ExecutionStatus.RUNNING,
  conversation_url: null,
  session_api_key: null,
  sandbox_id: "sandbox-xyz",
  sub_conversation_ids: [],
  ...overrides,
});

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([cloudBackend]);
  setActiveSelection({ backendId: cloudBackend.id });
  vi.mocked(axios.request).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.restoreAllMocks();
});

describe("pauseConversation cloud branch", () => {
  it("POSTs directly to the cloud sandbox pause endpoint", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "batchGetAppConversations",
    ).mockResolvedValue([buildConversation({ sandbox_id: "sandbox-xyz" })]);
    vi.mocked(axios.request).mockResolvedValue({ data: { success: true } });

    await pauseConversation("conv-abc");

    expect(axios.request).toHaveBeenCalledOnce();
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toMatchObject({
      url: `${cloudBackend.host}/api/v1/sandboxes/sandbox-xyz/pause`,
      method: "POST",
      headers: { Authorization: "Bearer bearer-token" },
    });
  });

  it("throws and does not call the cloud API when the cloud conversation has no sandbox_id", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "batchGetAppConversations",
    ).mockResolvedValue([buildConversation({ sandbox_id: null })]);

    await expect(pauseConversation("conv-abc")).rejects.toThrow(/sandbox_id/);
    expect(axios.request).not.toHaveBeenCalled();
  });
});
