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

const localBackend: Backend = {
  id: "self-hosted",
  name: "Self-hosted",
  host: "http://192.168.1.99:9999",
  apiKey: "local-key",
  kind: "local",
};

const runtimeResponse = {
  id: "conv-abc",
  title: "Test conversation",
  created_at: "2026-04-16T00:00:00Z",
  updated_at: "2026-04-16T00:00:00Z",
  execution_status: "idle",
  metrics: null,
  stats: {
    usage_to_metrics: {
      agent: {
        model_name: "test-model",
        accumulated_cost: 1.23,
        max_budget_per_task: null,
        accumulated_token_usage: null,
        costs: [],
        response_latencies: [],
        token_usages: [],
      },
    },
  },
};

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AgentServerConversationService.getRuntimeConversation", () => {
  describe("cloud mode", () => {
    beforeEach(() => {
      __resetActiveStoreForTests();
      setRegisteredBackends([cloudBackend]);
      setActiveSelection({ backendId: cloudBackend.id });
      vi.mocked(axios.request).mockReset();
      vi.mocked(axios.post).mockReset();
    });

    it("reads runtime info from the first-class app-conversations API", async () => {
      vi.mocked(axios.request).mockResolvedValue({
        data: [
          {
            ...runtimeResponse,
            metrics: {
              accumulated_cost: 1.23,
              max_budget_per_task: null,
              accumulated_token_usage: null,
            },
          },
        ],
      });
      const conversationUrl =
        "http://abc123.runtime.all-hands.dev/api/conversations/conv-abc";

      const result =
        await AgentServerConversationService.getRuntimeConversation(
          "conv-abc",
          conversationUrl,
          "session-xyz",
        );

      expect(axios.post).not.toHaveBeenCalled();
      expect(axios.request).toHaveBeenCalledOnce();
      const [config] = vi.mocked(axios.request).mock.calls[0]!;
      expect(config).toMatchObject({
        url: `${cloudBackend.host}/api/v1/app-conversations?ids=conv-abc`,
        method: "GET",
      });
      expect(result.metrics?.accumulated_cost).toBe(1.23);
      expect(result.stats).toEqual({ usage_to_metrics: {} });
    });
  });

  describe("local mode", () => {
    beforeEach(() => {
      __resetActiveStoreForTests();
      setRegisteredBackends([localBackend]);
      setActiveSelection({ backendId: localBackend.id });
      vi.mocked(axios.post).mockReset();
    });

    it("targets the conversation_url host (not the active backend host) and forwards X-Session-API-Key", async () => {
      // Arrange
      const fetchMock = vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(runtimeResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const conversationUrl =
        "http://192.168.1.42:8888/api/conversations/conv-abc";

      // Act
      const result =
        await AgentServerConversationService.getRuntimeConversation(
          "conv-abc",
          conversationUrl,
          "session-xyz",
        );

      // Assert
      expect(axios.post).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledOnce();
      const call = fetchMock.mock.calls[0] as unknown as [
        RequestInfo,
        RequestInit,
      ];
      expect(String(call[0])).toContain("192.168.1.42:8888");
      expect(String(call[0])).not.toContain(localBackend.host);
      expect(call[1]?.headers).toMatchObject({
        "X-Session-API-Key": "session-xyz",
      });
      expect(result.id).toBe("conv-abc");
    });
  });
});
