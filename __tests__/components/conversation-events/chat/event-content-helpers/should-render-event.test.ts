import { describe, expect, it } from "vitest";
import { shouldRenderEvent } from "#/components/conversation-events/chat/event-content-helpers/should-render-event";
import {
  createPlanningFileEditorActionEvent,
  createOtherActionEvent,
  createPlanningObservationEvent,
  createUserMessageEvent,
} from "test-utils";
import { ACPToolCallEvent } from "#/types/agent-server/core/events/acp-tool-call-event";
import {
  ActionEvent,
  ObservationEvent,
  SecurityRisk,
} from "#/types/agent-server/core";
import { SwitchLLMAction } from "#/types/agent-server/core/base/action";
import { SwitchLLMObservation } from "#/types/agent-server/core/base/observation";

const makeACPEvent = (
  overrides: Partial<ACPToolCallEvent> = {},
): ACPToolCallEvent => ({
  id: "acp-1",
  kind: "ACPToolCallEvent",
  timestamp: "2024-01-01T00:00:00Z",
  source: "agent",
  tool_call_id: "tc-1",
  title: "Run command",
  status: "completed",
  tool_kind: "execute",
  raw_input: { command: "ls" },
  raw_output: "file.txt",
  content: null,
  is_error: false,
  ...overrides,
});

describe("shouldRenderEvent - PlanningFileEditorAction", () => {
  it("should return false for PlanningFileEditorAction", () => {
    const event = createPlanningFileEditorActionEvent("action-1");

    expect(shouldRenderEvent(event)).toBe(false);
  });

  it("should return true for other action types", () => {
    const event = createOtherActionEvent("action-1");

    expect(shouldRenderEvent(event)).toBe(true);
  });

  it("should return true for PlanningFileEditorObservation", () => {
    const event = createPlanningObservationEvent("obs-1");

    // Observations should still render (they're handled separately in event-message)
    expect(shouldRenderEvent(event)).toBe(true);
  });

  it("should return true for user message events", () => {
    const event = createUserMessageEvent("msg-1");

    expect(shouldRenderEvent(event)).toBe(true);
  });
});

describe("shouldRenderEvent - ACPToolCallEvent", () => {
  it("hides in_progress events so the card doesn't flash half-formed", () => {
    // ACP streams multiple events per ``tool_call_id``; the partially-
    // populated in-flight ones have to stay off-screen, otherwise the
    // user watches the card update in place mid-stream — visibly noisy.
    const event = makeACPEvent({ status: "in_progress", raw_input: {} });

    expect(shouldRenderEvent(event)).toBe(false);
  });

  it("renders completed events", () => {
    const event = makeACPEvent({ status: "completed" });

    expect(shouldRenderEvent(event)).toBe(true);
  });

  it("renders failed events", () => {
    const event = makeACPEvent({ status: "failed", is_error: true });

    expect(shouldRenderEvent(event)).toBe(true);
  });

  it("hides events with null status — treated as in-flight, not legacy", () => {
    // ``null`` used to be allowed for backwards compat with old agent-
    // server builds (before the field was required). Canvas's pinned
    // agent-server always sets a status, so a ``null`` we see today is
    // a streaming intermediate the SDK hasn't filled yet. Treating it
    // as in-flight matches the "wait for terminal" rule and stops the
    // pre-stream half-rendered card. If we ever need to reach an older
    // build, the right knob is to bump the pin, not loosen this gate.
    const event = makeACPEvent({ status: null });

    expect(shouldRenderEvent(event)).toBe(false);
  });
});

describe("shouldRenderEvent - SwitchLLM", () => {
  const switchAction: ActionEvent<SwitchLLMAction> = {
    id: "switch-action",
    timestamp: "2024-01-01T00:00:00Z",
    source: "agent",
    thought: [],
    thinking_blocks: [],
    action: {
      kind: "SwitchLLMAction",
      profile_name: "haiku",
      reason: "Use a cheaper model.",
    },
    tool_name: "switch_llm",
    tool_call_id: "tool-switch",
    tool_call: {
      id: "tool-switch",
      type: "function",
      function: {
        name: "switch_llm",
        arguments: JSON.stringify({ profile_name: "haiku" }),
      },
    },
    llm_response_id: "response-switch",
    security_risk: SecurityRisk.LOW,
  };

  const makeSwitchObservation = (
    overrides: Partial<SwitchLLMObservation> = {},
  ): ObservationEvent<SwitchLLMObservation> => ({
    id: "switch-observation",
    timestamp: "2024-01-01T00:00:01Z",
    source: "environment",
    tool_name: "switch_llm",
    tool_call_id: "tool-switch",
    action_id: "switch-action",
    observation: {
      kind: "SwitchLLMObservation",
      content: [{ type: "text", text: "Switched." }],
      is_error: false,
      profile_name: "haiku",
      reason: "Use a cheaper model.",
      active_model: "anthropic/claude-haiku-4-5",
      ...overrides,
    },
  });

  it("hides switch actions and successful observations for the shared model UI", () => {
    expect(shouldRenderEvent(switchAction)).toBe(false);
    expect(shouldRenderEvent(makeSwitchObservation())).toBe(false);
  });

  it("keeps failed switch observations visible", () => {
    expect(
      shouldRenderEvent(
        makeSwitchObservation({
          is_error: true,
          content: [{ type: "text", text: "Profile was not found." }],
        }),
      ),
    ).toBe(true);
  });
});
