import { describe, expect, it } from "vitest";
import {
  ActionEvent,
  ObservationEvent,
  MessageEvent,
  SecurityRisk,
  OpenHandsEvent,
} from "#/types/agent-server/core";
import { ACPToolCallEvent } from "#/types/agent-server/core/events/acp-tool-call-event";
import { StreamingDeltaEvent } from "#/types/agent-server/core/events/streaming-delta-event";
import { handleEventForUI } from "#/utils/handle-event-for-ui";

describe("handleEventForUI", () => {
  const mockObservationEvent: ObservationEvent = {
    id: "test-observation-1",
    timestamp: Date.now().toString(),
    source: "environment",
    tool_name: "execute_bash",
    tool_call_id: "call_123",
    observation: {
      kind: "ExecuteBashObservation",
      content: [{ type: "text", text: "hello\n" }],
      command: "echo hello",
      exit_code: 0,
      error: false,
      timeout: false,
      metadata: {
        exit_code: 0,
        pid: 12345,
        username: "user",
        hostname: "localhost",
        working_dir: "/home/user",
        py_interpreter_path: null,
        prefix: "",
        suffix: "",
      },
    },
    action_id: "test-action-1",
  };

  const mockActionEvent: ActionEvent = {
    id: "test-action-1",
    timestamp: Date.now().toString(),
    source: "agent",
    thought: [{ type: "text", text: "I need to execute a bash command" }],
    thinking_blocks: [],
    action: {
      kind: "ExecuteBashAction",
      command: "echo hello",
      is_input: false,
      timeout: null,
      reset: false,
    },
    tool_name: "execute_bash",
    tool_call_id: "call_123",
    tool_call: {
      id: "call_123",
      type: "function",
      function: {
        name: "execute_bash",
        arguments: '{"command": "echo hello"}',
      },
    },
    llm_response_id: "response_123",
    security_risk: SecurityRisk.UNKNOWN,
  };

  const mockMessageEvent: MessageEvent = {
    id: "test-event-1",
    timestamp: Date.now().toString(),
    source: "user",
    llm_message: {
      role: "user",
      content: [{ type: "text", text: "Hello, world!" }],
    },
    activated_microagents: [],
    extended_content: [],
  };

  const mockFinishActionEvent: ActionEvent = {
    id: "test-finish-action-1",
    timestamp: Date.now().toString(),
    source: "agent",
    thought: [],
    thinking_blocks: [],
    action: {
      kind: "FinishAction",
      message: "I'll start working on that. Done.",
    },
    tool_name: "finish",
    tool_call_id: "call_finish_1",
    tool_call: {
      id: "call_finish_1",
      type: "function",
      function: {
        name: "finish",
        arguments: JSON.stringify({
          message: "I'll start working on that. Done.",
        }),
      },
    },
    llm_response_id: "response_finish",
    security_risk: SecurityRisk.UNKNOWN,
  };

  const mockAgentMessageEvent: MessageEvent = {
    id: "test-agent-message-1",
    timestamp: Date.now().toString(),
    source: "agent",
    llm_message: {
      role: "assistant",
      content: [{ type: "text", text: "I'll start working on that. Done." }],
    },
    activated_microagents: [],
    extended_content: [],
  };

  const makeStreamingDelta = (
    id: string,
    content: string | null,
  ): StreamingDeltaEvent => ({
    id,
    kind: "StreamingDeltaEvent",
    timestamp: Date.now().toString(),
    source: "agent",
    content,
    reasoning_content: null,
  });

  it("should add non-observation events to the end of uiEvents", () => {
    const initialUiEvents = [mockMessageEvent];
    const result = handleEventForUI(mockActionEvent, initialUiEvents);

    expect(result).toEqual([mockMessageEvent, mockActionEvent]);
    expect(result).not.toBe(initialUiEvents); // Should return a new array
  });

  it("should replace corresponding action with observation when action exists", () => {
    const initialUiEvents = [mockMessageEvent, mockActionEvent];
    const result = handleEventForUI(mockObservationEvent, initialUiEvents);

    expect(result).toEqual([mockMessageEvent, mockObservationEvent]);
    expect(result).not.toBe(initialUiEvents); // Should return a new array
  });

  it("should add observation to end when corresponding action is not found", () => {
    const initialUiEvents = [mockMessageEvent];
    const result = handleEventForUI(mockObservationEvent, initialUiEvents);

    expect(result).toEqual([mockMessageEvent, mockObservationEvent]);
    expect(result).not.toBe(initialUiEvents); // Should return a new array
  });

  it("should handle empty uiEvents array", () => {
    const initialUiEvents: OpenHandsEvent[] = [];
    const result = handleEventForUI(mockObservationEvent, initialUiEvents);

    expect(result).toEqual([mockObservationEvent]);
    expect(result).not.toBe(initialUiEvents); // Should return a new array
  });

  it("should not mutate the original uiEvents array", () => {
    const initialUiEvents = [mockMessageEvent, mockActionEvent];
    const originalLength = initialUiEvents.length;
    const originalFirstEvent = initialUiEvents[0];

    handleEventForUI(mockObservationEvent, initialUiEvents);

    expect(initialUiEvents).toHaveLength(originalLength);
    expect(initialUiEvents[0]).toBe(originalFirstEvent);
    expect(initialUiEvents[1]).toBe(mockActionEvent); // Should not be replaced
  });

  it("should replace the correct action when multiple actions exist", () => {
    const anotherActionEvent: ActionEvent = {
      ...mockActionEvent,
      id: "test-action-2",
    };

    const initialUiEvents = [
      mockMessageEvent,
      mockActionEvent,
      anotherActionEvent,
    ];
    const result = handleEventForUI(mockObservationEvent, initialUiEvents);

    expect(result).toEqual([
      mockMessageEvent,
      mockObservationEvent,
      anotherActionEvent,
    ]);
  });

  it("should NOT replace ThinkAction with ThinkObservation", () => {
    const mockThinkAction: ActionEvent = {
      id: "test-think-action-1",
      timestamp: Date.now().toString(),
      source: "agent",
      thought: [{ type: "text", text: "I am thinking..." }],
      thinking_blocks: [],
      action: {
        kind: "ThinkAction",
        thought: "I am thinking...",
      },
      tool_name: "think",
      tool_call_id: "call_think_1",
      tool_call: {
        id: "call_think_1",
        type: "function",
        function: {
          name: "think",
          arguments: "",
        },
      },
      llm_response_id: "response_think",
      security_risk: SecurityRisk.UNKNOWN,
    };

    const mockThinkObservation: ObservationEvent = {
      id: "test-think-observation-1",
      timestamp: Date.now().toString(),
      source: "environment",
      tool_name: "think",
      tool_call_id: "call_think_1",
      observation: {
        kind: "ThinkObservation",
        content: [{ type: "text", text: "Your thought has been logged." }],
      },
      action_id: "test-think-action-1",
    };

    const initialUiEvents = [mockMessageEvent, mockThinkAction];
    const result = handleEventForUI(mockThinkObservation, initialUiEvents);

    // ThinkObservation should NOT be added - ThinkAction should remain
    expect(result).toEqual([mockMessageEvent, mockThinkAction]);
    expect(result).not.toBe(initialUiEvents);
  });

  describe("ACPToolCallEvent dedup", () => {
    const mockInProgress: ACPToolCallEvent = {
      kind: "ACPToolCallEvent",
      id: "acp-evt-1",
      timestamp: "2026-04-16T19:32:29.828069",
      source: "agent",
      tool_call_id: "toolu_ABC",
      title: "gh pr diff 490",
      tool_kind: "execute",
      status: "in_progress",
      raw_input: { command: "gh pr diff 490" },
      raw_output: null,
      content: null,
      is_error: false,
    };

    const mockCompleted: ACPToolCallEvent = {
      ...mockInProgress,
      id: "acp-evt-2",
      status: "completed",
      raw_output: "output text",
    };

    it("appends the first tool call for a new tool_call_id", () => {
      const result = handleEventForUI(mockInProgress, [mockMessageEvent]);

      expect(result).toEqual([mockMessageEvent, mockInProgress]);
    });

    it("replaces a later status event at the original position", () => {
      const result = handleEventForUI(mockCompleted, [
        mockMessageEvent,
        mockInProgress,
      ]);

      expect(result).toEqual([mockMessageEvent, mockCompleted]);
    });

    it("leaves tool calls with different tool_call_ids untouched", () => {
      const other: ACPToolCallEvent = {
        ...mockInProgress,
        id: "acp-evt-99",
        tool_call_id: "toolu_XYZ",
        title: "ls -la",
      };
      const result = handleEventForUI(mockCompleted, [
        mockMessageEvent,
        other,
        mockInProgress,
      ]);

      expect(result).toEqual([mockMessageEvent, other, mockCompleted]);
    });
  });

  describe("StreamingDeltaEvent", () => {
    it("merges consecutive deltas into a single provisional assistant event", () => {
      const first = makeStreamingDelta("delta-1", "I'll start ");
      const second = makeStreamingDelta("delta-2", "working on that.");

      const afterFirst = handleEventForUI(first, [mockMessageEvent]);
      const afterSecond = handleEventForUI(second, afterFirst);

      expect(afterSecond).toEqual([
        mockMessageEvent,
        {
          ...second,
          content: "I'll start working on that.",
          reasoning_content: null,
        },
      ]);
    });

    it("finalizes streamed deltas in place when finish arrives", () => {
      const first = makeStreamingDelta("delta-1", "I'll start ");
      const second = makeStreamingDelta("delta-2", "working on that.");
      const streamedDelta = handleEventForUI(
        second,
        handleEventForUI(first, []),
      ).at(-1)!;
      const uiEvents = [mockMessageEvent, streamedDelta];

      const result = handleEventForUI(mockFinishActionEvent, uiEvents);

      expect(result).toEqual([
        mockMessageEvent,
        {
          ...streamedDelta,
          content: "I'll start working on that. Done.",
        },
      ]);
    });

    it("finalizes streamed deltas in place when an agent message arrives", () => {
      const first = makeStreamingDelta("delta-1", "I'll start ");
      const second = makeStreamingDelta("delta-2", "working on that.");
      const streamedDelta = handleEventForUI(
        second,
        handleEventForUI(first, []),
      ).at(-1)!;
      const uiEvents = [mockMessageEvent, streamedDelta];

      const result = handleEventForUI(mockAgentMessageEvent, uiEvents);

      expect(result).toEqual([
        mockMessageEvent,
        {
          ...streamedDelta,
          content: "I'll start working on that. Done.",
        },
      ]);
    });

    it("keeps streamed deltas in their original locations when the final message aggregates them", () => {
      const first = makeStreamingDelta(
        "delta-1",
        "I'll start working on that.",
      );
      const second = makeStreamingDelta("delta-2", "I found the issue.");
      const aggregateAgentMessage: MessageEvent = {
        ...mockAgentMessageEvent,
        llm_message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "I'll start working on that.I found the issue.",
            },
          ],
        },
      };

      const afterFirst = handleEventForUI(first, [mockMessageEvent]);
      const afterObservation = handleEventForUI(mockObservationEvent, afterFirst);
      const afterSecond = handleEventForUI(second, afterObservation);
      const result = handleEventForUI(aggregateAgentMessage, afterSecond);

      expect(result).toEqual([
        mockMessageEvent,
        first,
        mockObservationEvent,
        second,
      ]);
    });

    it("appends a distinct final message that does not match streamed text", () => {
      const streamedDelta = makeStreamingDelta(
        "delta-1",
        "I'll start working on that.",
      );
      const finalMessage: MessageEvent = {
        ...mockAgentMessageEvent,
        llm_message: {
          role: "assistant",
          content: [{ type: "text", text: "Done." }],
        },
      };

      const result = handleEventForUI(finalMessage, [
        mockMessageEvent,
        streamedDelta,
      ]);

      expect(result).toEqual([mockMessageEvent, streamedDelta, finalMessage]);
    });

    it("keeps deltas from older turns when a later turn finishes", () => {
      const oldUserMessage: MessageEvent = {
        ...mockMessageEvent,
        id: "old-user-message",
      };
      const nextUserMessage: MessageEvent = {
        ...mockMessageEvent,
        id: "next-user-message",
        llm_message: {
          role: "user",
          content: [{ type: "text", text: "Next task" }],
        },
      };
      const oldDelta = makeStreamingDelta("old-delta", "Old live text");
      const currentDelta = makeStreamingDelta(
        "current-delta",
        "Current live text",
      );

      const result = handleEventForUI(mockFinishActionEvent, [
        oldUserMessage,
        oldDelta,
        nextUserMessage,
        currentDelta,
      ]);

      expect(result).toEqual([
        oldUserMessage,
        oldDelta,
        nextUserMessage,
        currentDelta,
        mockFinishActionEvent,
      ]);
    });

    it("appends final message normally when all deltas are reasoning-only", () => {
      // When every streaming delta carries only reasoning_content (no content),
      // streamingSegments is empty → finalizeStreamingDeltasInPlace returns null
      // → finalEvent is appended after the delta as a regular message bubble.
      const reasoningDelta: StreamingDeltaEvent = {
        id: "delta-reasoning",
        kind: "StreamingDeltaEvent",
        timestamp: Date.now().toString(),
        source: "agent",
        content: null,
        reasoning_content: "thinking...",
      };
      const result = handleEventForUI(mockAgentMessageEvent, [
        mockMessageEvent,
        reasoningDelta,
      ]);
      expect(result).toEqual([
        mockMessageEvent,
        reasoningDelta,
        mockAgentMessageEvent,
      ]);
    });
  });

  it("should NOT add ThinkObservation even when ThinkAction is not found", () => {
    const mockThinkObservation: ObservationEvent = {
      id: "test-think-observation-1",
      timestamp: Date.now().toString(),
      source: "environment",
      tool_name: "think",
      tool_call_id: "call_think_1",
      observation: {
        kind: "ThinkObservation",
        content: [{ type: "text", text: "Your thought has been logged." }],
      },
      action_id: "test-think-action-not-found",
    };

    const initialUiEvents = [mockMessageEvent];
    const result = handleEventForUI(mockThinkObservation, initialUiEvents);

    // ThinkObservation should never be added to uiEvents
    expect(result).toEqual([mockMessageEvent]);
    expect(result).not.toBe(initialUiEvents);
  });
});
