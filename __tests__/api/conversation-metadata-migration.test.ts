import { ConversationClient } from "@openhands/typescript-client/clients";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrateLegacyConversationMetadata } from "#/api/conversation-metadata-migration";
import {
  getStoredConversationMetadata,
  setStoredConversationMetadata,
} from "#/api/conversation-metadata-store";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

const updateConversation = vi.fn();

vi.mock("@openhands/typescript-client/clients", async () => {
  const actual = await vi.importActual<
    typeof import("@openhands/typescript-client/clients")
  >("@openhands/typescript-client/clients");
  return {
    ...actual,
    ConversationClient: vi.fn(function ConversationClientMock() {
      return { updateConversation };
    }),
  };
});

vi.mock("#/api/agent-server-client-options", () => ({
  getAgentServerClientOptions: vi.fn(() => ({
    host: "http://localhost:18000",
    apiKey: "test-key",
    workingDir: "workspace/project",
  })),
}));

vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: vi.fn(() => ({
    backend: { kind: "local", id: "default-local" },
  })),
}));

const makeConversation = (
  id: string,
  tags: Record<string, string> | null = null,
): AppConversation =>
  ({
    id,
    title: "x",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    selected_repository: null,
    selected_branch: null,
    git_provider: null,
    selected_workspace: null,
    active_profile: null,
    tags,
  }) as unknown as AppConversation;

describe("migrateLegacyConversationMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    updateConversation.mockResolvedValue(undefined);
    vi.mocked(ConversationClient).mockClear();
  });

  it("PATCHes legacy localStorage entries onto server tags and clears the entry", async () => {
    setStoredConversationMetadata("conv-1", {
      selected_repository: "octocat/hello-world",
      selected_branch: "main",
      git_provider: "github",
      selected_workspace: null,
      active_profile: "team-default",
    });

    // Server has no agent-canvas tags yet — pure legacy state.
    await migrateLegacyConversationMetadata([makeConversation("conv-1", null)]);

    expect(updateConversation).toHaveBeenCalledTimes(1);
    expect(updateConversation).toHaveBeenCalledWith("conv-1", {
      tags: {
        selected_repository: "octocat/hello-world",
        selected_branch: "main",
        git_provider: "github",
        active_profile: "team-default",
      },
    });
    expect(getStoredConversationMetadata("conv-1")).toBeNull();
  });

  it("skips fields the server already has and clears the localStorage entry without PATCHing when fully mirrored", async () => {
    setStoredConversationMetadata("conv-2", {
      selected_repository: "octocat/hello-world",
      selected_branch: "main",
      git_provider: "github",
    });

    // The server already mirrors every field — nothing to migrate, just
    // drop the stale legacy entry.
    await migrateLegacyConversationMetadata([
      makeConversation("conv-2", {
        selected_repository: "octocat/hello-world",
        selected_branch: "main",
        git_provider: "github",
      }),
    ]);

    expect(updateConversation).not.toHaveBeenCalled();
    expect(getStoredConversationMetadata("conv-2")).toBeNull();
  });

  it("preserves unrelated server tags (e.g. acpserver) when merging in legacy values", async () => {
    setStoredConversationMetadata("conv-3", {
      selected_repository: "octocat/hello-world",
      selected_branch: null,
      git_provider: "github",
    });

    await migrateLegacyConversationMetadata([
      makeConversation("conv-3", { acpserver: "claude-code" }),
    ]);

    expect(updateConversation).toHaveBeenCalledTimes(1);
    const [, body] = updateConversation.mock.calls[0];
    expect(body.tags).toEqual({
      acpserver: "claude-code",
      selected_repository: "octocat/hello-world",
      git_provider: "github",
    });
  });

  it("leaves the legacy entry in place if the PATCH fails so the next refresh retries", async () => {
    setStoredConversationMetadata("conv-4", {
      selected_repository: "octocat/hello-world",
      selected_branch: null,
      git_provider: "github",
    });
    updateConversation.mockRejectedValueOnce(new Error("boom"));

    await migrateLegacyConversationMetadata([makeConversation("conv-4", null)]);

    expect(getStoredConversationMetadata("conv-4")).not.toBeNull();
  });

  it("is a no-op when no conversations are passed", async () => {
    setStoredConversationMetadata("conv-5", {
      selected_repository: "octocat/hello-world",
      selected_branch: null,
      git_provider: "github",
    });

    await migrateLegacyConversationMetadata([]);

    expect(updateConversation).not.toHaveBeenCalled();
    // Untouched — the entry will be migrated next time the list query
    // returns conv-5.
    expect(getStoredConversationMetadata("conv-5")).not.toBeNull();
  });
});
