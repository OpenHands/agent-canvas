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

// The hook now PATCHes the `active_profile` server tag through the
// conversation service instead of stashing it in localStorage. We mock the
// static method so the test asserts the call shape without touching the
// network or the agent-server client. The mock object must be created via
// `vi.hoisted` because `vi.mock` is hoisted above plain top-level decls.
const { updateActiveProfileMock } = vi.hoisted(() => ({
  updateActiveProfileMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({
    default: {
      updateConversationActiveProfile: updateActiveProfileMock,
    },
  }),
);

import { useSwitchLlmProfileAndLog } from "#/hooks/mutation/use-switch-llm-profile-and-log";

describe("useSwitchLlmProfileAndLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PATCHes the switched-to profile onto the conversation tag (#1082)", () => {
    switchMutateMock.mockImplementation((_vars, opts) => opts?.onSuccess?.());

    const { result } = renderHook(() => useSwitchLlmProfileAndLog());
    result.current.switchAndLog("conv-1", "claude-sonnet-4.6");

    // The merge with existing repo/workspace tags happens server-side in
    // `updateConversationActiveProfile`; this test just asserts the wrapper
    // routed the switch through the service with the right arguments.
    expect(updateActiveProfileMock).toHaveBeenCalledWith(
      "conv-1",
      "claude-sonnet-4.6",
    );
  });

  it("does not PATCH a tag on the home-page activate path (conversationId === null)", () => {
    switchMutateMock.mockImplementation((_vars, opts) => opts?.onSuccess?.());

    const { result } = renderHook(() => useSwitchLlmProfileAndLog());
    result.current.switchAndLog(null, "claude-sonnet-4.6");

    // No conversation to scope the stamp to → no PATCH.
    expect(updateActiveProfileMock).not.toHaveBeenCalled();
  });

  it("does not PATCH a tag when the switch fails", () => {
    switchMutateMock.mockImplementation((_vars, opts) =>
      opts?.onError?.(new Error("boom")),
    );

    const { result } = renderHook(() => useSwitchLlmProfileAndLog());
    result.current.switchAndLog("conv-1", "claude-sonnet-4.6");

    expect(updateActiveProfileMock).not.toHaveBeenCalled();
  });
});
