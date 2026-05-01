import React from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentState } from "./use-agent-state";
import { useActiveConversation } from "./query/use-active-conversation";
import {
  ConversationProvider,
  useV1ConversationStateStoreApi,
} from "#/context/conversation-context";
import { AgentState } from "#/types/agent-state";
import { V1ExecutionStatus } from "#/types/v1/core/base/common";

vi.mock("./query/use-active-conversation", () => ({
  useActiveConversation: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ConversationProvider conversationId="test">
      {children}
    </ConversationProvider>
  );
}

describe("useAgentState", () => {
  const mockUseActiveConversation = vi.mocked(useActiveConversation);

  beforeEach(() => {
    mockUseActiveConversation.mockReturnValue({
      data: null,
    } as ReturnType<typeof useActiveConversation>);
  });

  it("prefers live websocket execution status over cached conversation status", () => {
    mockUseActiveConversation.mockReturnValue({
      data: {
        execution_status: V1ExecutionStatus.FINISHED,
      },
    } as ReturnType<typeof useActiveConversation>);

    const { result } = renderHook(
      () => ({
        agentState: useAgentState(),
        v1Store: useV1ConversationStateStoreApi(),
      }),
      { wrapper },
    );

    act(() => {
      result.current.v1Store
        .getState()
        .setExecutionStatus(V1ExecutionStatus.RUNNING);
    });

    expect(result.current.agentState.executionStatus).toBe(
      V1ExecutionStatus.RUNNING,
    );
    expect(result.current.agentState.curAgentState).toBe(AgentState.RUNNING);
  });

  it("falls back to cached conversation execution status when live state is empty", () => {
    mockUseActiveConversation.mockReturnValue({
      data: {
        execution_status: V1ExecutionStatus.WAITING_FOR_CONFIRMATION,
      },
    } as ReturnType<typeof useActiveConversation>);

    const { result } = renderHook(() => useAgentState(), { wrapper });

    expect(result.current.executionStatus).toBe(
      V1ExecutionStatus.WAITING_FOR_CONFIRMATION,
    );
    expect(result.current.curAgentState).toBe(
      AgentState.AWAITING_USER_CONFIRMATION,
    );
  });
});
