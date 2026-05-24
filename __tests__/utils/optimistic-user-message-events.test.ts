import { describe, expect, it } from "vitest";
import {
  MessageEvent,
  OpenHandsEvent,
  SecurityRisk,
} from "#/types/agent-server/core";
import { PendingUserMessage } from "#/stores/optimistic-user-message-store";
import {
  isOptimisticUserMessageEvent,
  mergeOptimisticUserMessages,
} from "#/utils/optimistic-user-message-events";

describe("optimistic-user-message-events", () => {
  const userEvent: MessageEvent = {
    id: "server-user",
    timestamp: "2026-05-24T09:11:33.000Z",
    source: "user",
    llm_message: {
      role: "user",
      content: [{ type: "text", text: "server message" }],
    },
    activated_microagents: [],
    extended_content: [],
  };

  const agentEvent: OpenHandsEvent = {
    id: "agent-event",
    timestamp: "2026-05-24T09:11:35.000Z",
    source: "agent",
    thought: [],
    thinking_blocks: [],
    action: {
      kind: "FinishAction",
      message: "done",
    },
    tool_name: "finish",
    tool_call_id: "finish-call",
    tool_call: {
      id: "finish-call",
      type: "function",
      function: {
        name: "finish",
        arguments: JSON.stringify({ message: "done" }),
      },
    },
    llm_response_id: "response",
    security_risk: SecurityRisk.UNKNOWN,
  };

  const pendingMessage: PendingUserMessage = {
    id: "pending-1",
    conversationId: "conv-1",
    text: "optimistic message",
    content: "optimistic message",
    status: "sending",
    imageUrls: [],
    fileUrls: [],
    timestamp: "2026-05-24T09:11:34.000Z",
  };

  it("inserts pending messages into timestamp order", () => {
    const merged = mergeOptimisticUserMessages(
      [userEvent, agentEvent],
      [pendingMessage],
    );

    expect(merged.map((event) => event.id)).toEqual([
      "server-user",
      "pending-1",
      "agent-event",
    ]);
    expect(isOptimisticUserMessageEvent(merged[1])).toBe(true);
  });

  it("carries pending status into the optimistic event", () => {
    const [event] = mergeOptimisticUserMessages(
      [],
      [{ ...pendingMessage, status: "queued" }],
    );

    expect(isOptimisticUserMessageEvent(event)).toBe(true);
    if (isOptimisticUserMessageEvent(event)) {
      expect(event.optimisticPendingStatus).toBe("queued");
      expect(event.llm_message.content).toEqual([
        { type: "text", text: "optimistic message" },
      ]);
    }
  });

  it("does not duplicate an event that already exists", () => {
    const merged = mergeOptimisticUserMessages(
      [userEvent],
      [{ ...pendingMessage, id: userEvent.id }],
    );

    expect(merged).toEqual([userEvent]);
  });
});
