import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Backend,
  ResolvedActiveBackend,
} from "#/api/backend-registry/types";
import { ExecutionStatus } from "#/types/agent-server/core";
import type { AppConversation } from "./agent-server-conversation-service.types";
import { buildSecretUpdatePayload } from "./conversation-secret-sync";

let activeBackend: ResolvedActiveBackend = {
  backend: {
    id: "local-backend",
    name: "Local",
    host: "http://localhost:8001",
    apiKey: "local-session-key",
    kind: "local" as const,
  },
  orgId: null,
};
let effectiveBackend: Backend | null = activeBackend.backend;

vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: () => activeBackend,
  getEffectiveLocalBackend: () => effectiveBackend,
}));

function conversation(
  overrides: Partial<AppConversation> = {},
): AppConversation {
  return {
    id: "conversation-1",
    created_by_user_id: null,
    selected_repository: null,
    selected_branch: null,
    git_provider: null,
    title: "Conversation 1",
    trigger: null,
    pr_number: [],
    llm_model: null,
    metrics: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    execution_status: ExecutionStatus.IDLE,
    conversation_url: "http://localhost:8001/api/conversations/conversation-1",
    session_api_key: null,
    sandbox_id: null,
    sub_conversation_ids: [],
    ...overrides,
  };
}

describe("buildSecretUpdatePayload", () => {
  beforeEach(() => {
    activeBackend = {
      backend: {
        id: "local-backend",
        name: "Local",
        host: "http://localhost:8001",
        apiKey: "local-session-key",
        kind: "local",
      },
      orgId: null,
    };
    effectiveBackend = activeBackend.backend;
  });

  it("builds a local LookupSecret using the backend auth header", () => {
    expect(
      buildSecretUpdatePayload(conversation(), {
        name: "RESEND_API_KEY",
        description: "Email alerts",
      }),
    ).toEqual({
      secrets: {
        RESEND_API_KEY: {
          kind: "LookupSecret",
          url: "/api/settings/secrets/RESEND_API_KEY",
          headers: { "X-Session-API-Key": "local-session-key" },
          description: "Email alerts",
        },
      },
    });
  });

  it("prefers the conversation session key when local conversations have one", () => {
    expect(
      buildSecretUpdatePayload(
        conversation({ session_api_key: "conversation-session-key" }),
        { name: "GITHUB_TOKEN" },
      ),
    ).toMatchObject({
      secrets: {
        GITHUB_TOKEN: {
          headers: { "X-Session-API-Key": "conversation-session-key" },
        },
      },
    });
  });

  it("builds a cloud LookupSecret against the sandbox settings endpoint", () => {
    activeBackend = {
      backend: {
        id: "cloud-backend",
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "cloud-token",
        kind: "cloud",
      },
      orgId: "org-1",
    };
    effectiveBackend = null;

    expect(
      buildSecretUpdatePayload(
        conversation({
          sandbox_id: "sandbox-1",
          session_api_key: "sandbox-session-key",
        }),
        { name: "RESEND_API_KEY" },
      ),
    ).toEqual({
      secrets: {
        RESEND_API_KEY: {
          kind: "LookupSecret",
          url: "https://app.all-hands.dev/api/v1/sandboxes/sandbox-1/settings/secrets/RESEND_API_KEY",
          headers: { "X-Session-API-Key": "sandbox-session-key" },
        },
      },
    });
  });
});
