import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import V1ConversationService from "#/api/conversation-service/v1-conversation-service.api";

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
  vi.mocked(axios.post).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("V1ConversationService cloud branch", () => {
  it("createConversation POSTs the SaaS payload through the proxy and returns a WORKING task", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        id: "task-123",
        created_by_user_id: null,
        status: "WORKING",
        detail: null,
        app_conversation_id: null,
        agent_server_url: null,
        request: {},
        created_at: "2026-05-06T00:00:00Z",
        updated_at: "2026-05-06T00:00:00Z",
      },
    });

    const result = await V1ConversationService.createConversation(
      "fix the bug",
      "Optional title",
      undefined,
      {
        selected_repository: "user/repo",
        selected_branch: "main",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        git_provider: "github" as any,
      },
    );

    expect(axios.post).toHaveBeenCalledOnce();
    const [url, body] = vi.mocked(axios.post).mock.calls[0]!;

    // Must go through the local cloud-proxy (not directly to cloud).
    expect(url).toMatch(/\/api\/cloud-proxy$/);
    expect(body).toMatchObject({
      host: cloudBackend.host,
      method: "POST",
      path: "/api/v1/app-conversations",
      headers: { Authorization: "Bearer bearer-token" },
    });
    const proxiedBody = (body as { body: Record<string, unknown> }).body;

    // SaaS payload shape — flat fields, NO encrypted-settings round-trip.
    expect(proxiedBody.selected_repository).toBe("user/repo");
    expect(proxiedBody.selected_branch).toBe("main");
    expect(proxiedBody.git_provider).toBe("github");
    expect(proxiedBody.title).toBe("Optional title");
    expect(proxiedBody.initial_message).toEqual({
      role: "user",
      content: [{ type: "text", text: "fix the bug" }],
    });
    // The local-only encrypted-settings keys must NOT be present.
    expect(proxiedBody).not.toHaveProperty("agent_settings_encrypted");
    expect(proxiedBody).not.toHaveProperty("conversation_settings_encrypted");

    // The returned task is the upstream task — WORKING, no app_conversation_id yet.
    expect(result.id).toBe("task-123");
    expect(result.status).toBe("WORKING");
    expect(result.app_conversation_id).toBeNull();
  });

  it("getStartTask polls /api/v1/app-conversations/start-tasks?ids= through the proxy", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: [
        {
          id: "task-123",
          created_by_user_id: null,
          status: "READY",
          detail: null,
          app_conversation_id: "conv-456",
          agent_server_url: "https://runtime-456.app.all-hands.dev",
          request: {},
          created_at: "2026-05-06T00:00:00Z",
          updated_at: "2026-05-06T00:00:00Z",
        },
      ],
    });

    const result = await V1ConversationService.getStartTask("task-123");

    const [url, body] = vi.mocked(axios.post).mock.calls[0]!;
    expect(url).toMatch(/\/api\/cloud-proxy$/);
    expect(body).toMatchObject({
      host: cloudBackend.host,
      method: "GET",
      path: "/api/v1/app-conversations/start-tasks?ids=task-123",
    });
    expect(result?.status).toBe("READY");
    expect(result?.app_conversation_id).toBe("conv-456");
  });
});
