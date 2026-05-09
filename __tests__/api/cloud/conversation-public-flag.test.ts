import axios from "axios";
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
  vi.mocked(axios.post).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("AgentServerConversationService.updateConversationPublicFlag", () => {
  it("PATCHes /api/v1/app-conversations/{id} via cloud-proxy on a cloud backend", async () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });
    vi.mocked(axios.post).mockResolvedValue({
      data: { id: "conv-abc", public: true },
    });

    await AgentServerConversationService.updateConversationPublicFlag("conv-abc", true);

    expect(axios.post).toHaveBeenCalledOnce();
    const [url, body] = vi.mocked(axios.post).mock.calls[0]!;
    expect(url).toMatch(/\/api\/cloud-proxy$/);
    expect(body).toMatchObject({
      host: cloudBackend.host,
      method: "PATCH",
      path: "/api/v1/app-conversations/conv-abc",
      body: { public: true },
    });
  });

  it("rejects without calling the proxy when the active backend is local", async () => {
    // Default state after reset is the bundled local backend.
    await expect(
      AgentServerConversationService.updateConversationPublicFlag("conv-abc", true),
    ).rejects.toThrow(/cloud backend/);
    expect(axios.post).not.toHaveBeenCalled();
  });
});
