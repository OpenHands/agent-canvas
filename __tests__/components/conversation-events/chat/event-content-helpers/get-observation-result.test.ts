import { describe, expect, it } from "vitest";
import { getACPToolCallResult } from "#/components/conversation-events/chat/event-content-helpers/get-observation-result";
import { ACPToolCallEvent } from "#/types/agent-server/core/events/acp-tool-call-event";

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

describe("getACPToolCallResult", () => {
  it("maps completed → success", () => {
    expect(getACPToolCallResult(makeACPEvent({ status: "completed" }))).toBe(
      "success",
    );
  });

  it("maps failed → error", () => {
    expect(getACPToolCallResult(makeACPEvent({ status: "failed" }))).toBe(
      "error",
    );
  });

  it("maps is_error → error even when status is completed", () => {
    expect(
      getACPToolCallResult(makeACPEvent({ status: "completed", is_error: true })),
    ).toBe("error");
  });

  it.each(["pending", "in_progress"] as const)(
    "maps non-terminal status %s → undefined (running card)",
    (status) => {
      expect(getACPToolCallResult(makeACPEvent({ status }))).toBeUndefined();
    },
  );

  it("maps null status → undefined (running card)", () => {
    expect(getACPToolCallResult(makeACPEvent({ status: null }))).toBeUndefined();
  });
});
