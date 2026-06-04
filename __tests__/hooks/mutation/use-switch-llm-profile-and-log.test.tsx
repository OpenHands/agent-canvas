import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// The wrapper drives the base mutation; mock it so we can deterministically
// trigger the success / error callbacks the wrapper passes in.
const switchMutateMock = vi.fn();
vi.mock("#/hooks/mutation/use-switch-llm-profile", () => ({
  useSwitchLlmProfile: () => ({ mutate: switchMutateMock, isPending: false }),
}));

vi.mock("#/hooks/chat/record-model-switch-message", () => ({
  recordModelSwitchMessage: vi.fn(),
}));

vi.mock("#/hooks/chat/model-command-event-anchor", () => ({
  getLastRenderableEventId: () => null,
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
}));

import { useSwitchLlmProfileAndLog } from "#/hooks/mutation/use-switch-llm-profile-and-log";
import {
  getStoredConversationMetadata,
  setStoredConversationMetadata,
} from "#/api/conversation-metadata-store";

describe("useSwitchLlmProfileAndLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("stamps the switched-to profile onto the conversation metadata, preserving repo/workspace (#1082)", () => {
    switchMutateMock.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    // Repo metadata persisted at creation must survive the merge.
    setStoredConversationMetadata("conv-1", {
      selected_repository: "octocat/hello-world",
      selected_branch: "main",
      git_provider: "github",
    });

    const { result } = renderHook(() => useSwitchLlmProfileAndLog());
    result.current.switchAndLog("conv-1", "claude-sonnet-4.6");

    expect(getStoredConversationMetadata("conv-1")).toEqual({
      selected_repository: "octocat/hello-world",
      selected_branch: "main",
      git_provider: "github",
      selected_workspace: null,
      active_profile: "claude-sonnet-4.6",
    });
  });

  it("does not stamp metadata for the home-page activate path (conversationId === null)", () => {
    switchMutateMock.mockImplementation((_vars, opts) => opts?.onSuccess?.());

    const { result } = renderHook(() => useSwitchLlmProfileAndLog());
    result.current.switchAndLog(null, "claude-sonnet-4.6");

    // No conversation to scope the stamp to → nothing written.
    expect(getStoredConversationMetadata("conv-1")).toBeNull();
  });

  it("does not stamp metadata when the switch fails", () => {
    switchMutateMock.mockImplementation((_vars, opts) =>
      opts?.onError?.(new Error("boom")),
    );

    const { result } = renderHook(() => useSwitchLlmProfileAndLog());
    result.current.switchAndLog("conv-1", "claude-sonnet-4.6");

    expect(getStoredConversationMetadata("conv-1")).toBeNull();
  });
});
