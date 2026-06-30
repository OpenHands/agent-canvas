import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "test-utils";
import {
  ActionEvent,
  MessageEvent,
  ObservationEvent,
  OpenHandsEvent,
  SecurityRisk,
} from "#/types/agent-server/core";
import { StreamingDeltaEvent } from "#/types/agent-server/core/events/streaming-delta-event";
import { handleEventForUI } from "#/utils/handle-event-for-ui";
import { Messages } from "#/components/conversation-events/chat/messages";

// Regression for issue #1534. With stream=true the agent streams its
// pre-tool-call text as a StreamingDeltaEvent and then emits an intermediate
// ActionEvent whose `thought` is that same text. The chat hoists the action's
// thought into its own message, so the leftover streaming delta used to render
// the identical text a second time. This test drives the real reducer
// (handleEventForUI) and renders the real <Messages> tree to assert the text
// shows exactly once.

const THOUGHT =
  "I'll create a webpage explaining what OpenHands can do. " +
  "Let me first gather accurate information from the official documentation.";

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

const userMessage: MessageEvent = {
  id: "user-1",
  timestamp: "2026-06-12T12:00:00Z",
  source: "user",
  llm_message: {
    role: "user",
    content: [{ type: "text", text: "Create a basic webpage." }],
  },
  activated_microagents: [],
  extended_content: [],
};

// The reasoning streamed as a delta; many models carry reasoning ONLY here, so
// the collapsible "Thinking" must survive the reconciliation.
const streamingDelta: StreamingDeltaEvent = {
  id: "delta-1",
  kind: "StreamingDeltaEvent",
  timestamp: "2026-06-12T12:00:01Z",
  source: "agent",
  content: THOUGHT,
  reasoning_content: "Considering the request before acting.",
};

const action: ActionEvent = {
  id: "action-1",
  timestamp: "2026-06-12T12:00:02Z",
  source: "agent",
  thought: [{ type: "text", text: THOUGHT }],
  thinking_blocks: [],
  action: {
    kind: "ExecuteBashAction",
    command: "ls",
    is_input: false,
    timeout: null,
    reset: false,
  },
  tool_name: "execute_bash",
  tool_call_id: "call_1",
  tool_call: {
    id: "call_1",
    type: "function",
    function: { name: "execute_bash", arguments: '{"command":"ls"}' },
  },
  llm_response_id: "resp-1",
  security_risk: SecurityRisk.UNKNOWN,
};

const observation: ObservationEvent = {
  id: "obs-1",
  timestamp: "2026-06-12T12:00:03Z",
  source: "environment",
  tool_name: "execute_bash",
  tool_call_id: "call_1",
  observation: {
    kind: "ExecuteBashObservation",
    content: [{ type: "text", text: "file.txt\n" }],
    command: "ls",
    exit_code: 0,
    error: false,
    timeout: false,
    metadata: {
      exit_code: 0,
      pid: 1,
      username: "u",
      hostname: "h",
      working_dir: "/",
      py_interpreter_path: null,
      prefix: "",
      suffix: "",
    },
  },
  action_id: "action-1",
};

const reduce = (events: OpenHandsEvent[]): OpenHandsEvent[] =>
  events.reduce<OpenHandsEvent[]>((ui, ev) => handleEventForUI(ev, ui), []);

describe("issue #1534 — streamed intermediate message duplication", () => {
  it("renders the intermediate thought text exactly once", () => {
    const allEvents = [userMessage, streamingDelta, action, observation];
    const uiEvents = reduce(allEvents);

    const { container } = renderWithProviders(
      <Messages messages={uiEvents} allEvents={allEvents} />,
    );

    expect(countOccurrences(container.textContent ?? "", THOUGHT)).toBe(1);
  });

  it("keeps the streamed reasoning visible (Thinking section survives)", () => {
    const allEvents = [userMessage, streamingDelta, action, observation];
    const uiEvents = reduce(allEvents);

    renderWithProviders(<Messages messages={uiEvents} allEvents={allEvents} />);

    // The collapsible "Thinking" section is still rendered (collapsed by
    // default); expanding it reveals the reasoning that was streamed on the
    // delta, proving the reconciliation kept the reasoning.
    fireEvent.click(screen.getByTestId("collapsible-thinking-toggle"));
    expect(
      screen.getByTestId("collapsible-thinking-content").textContent ?? "",
    ).toContain("Considering the request before acting.");
  });

  it("still renders a final agent message exactly once (unchanged)", () => {
    const finalMessage: MessageEvent = {
      id: "agent-msg-1",
      timestamp: "2026-06-12T12:00:02Z",
      source: "agent",
      llm_message: {
        role: "assistant",
        content: [{ type: "text", text: THOUGHT }],
      },
      activated_microagents: [],
      extended_content: [],
    };
    const allEvents = [userMessage, streamingDelta, finalMessage];
    const uiEvents = reduce(allEvents);

    const { container } = renderWithProviders(
      <Messages messages={uiEvents} allEvents={allEvents} />,
    );

    expect(countOccurrences(container.textContent ?? "", THOUGHT)).toBe(1);
  });
});
