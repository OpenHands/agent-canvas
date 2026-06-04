import axios from "axios";
import {
  capturedUpstreamRequest,
  resetCloudProxyMock,
} from "./_proxy-test-helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";

vi.mock("axios");

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([cloudBackend]);
  setActiveSelection({ backendId: cloudBackend.id });
  resetCloudProxyMock();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("AgentServerConversationService.deleteConversation cloud branch", () => {
  it("calls the cloud DELETE app-conversations endpoint directly", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { success: true } });

    await AgentServerConversationService.deleteConversation("conv-abc");

    expect(axios.post).toHaveBeenCalledOnce();
    const config = capturedUpstreamRequest(0);

    expect(config).toMatchObject({
      url: `${cloudBackend.host}/api/v1/app-conversations/conv-abc`,
      method: "DELETE",
      headers: { Authorization: "Bearer bearer-token" },
    });
  });
});
