import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEventStore } from "#/stores/use-event-store";
import {
  ActionEvent,
  MessageEvent,
  ObservationEvent,
  SecurityRisk,
} from "#/types/agent-server/core";
import type { BrowserObservation } from "#/types/agent-server/core/base/observation";

const makeBrowserObservation = (): ObservationEvent<BrowserObservation> => ({
  id: "obs-browser-1",
  timestamp: "2024-01-01T00:00:05Z",
  source: "environment",
  tool_name: "browser",
  tool_call_id: "call_browser_1",
  action_id: "act-browser-1",
  observation: {
    kind: "BrowserObservation",
    output: "navigated to https://example.com",
    error: null,
    screenshot_data: "BASE64_SCREENSHOT_BLOB",
  },
});

const storedScreenshot = (eventId: string): string | null | undefined => {
  const event = useEventStore
    .getState()
    .events.find((e) => (e as { id?: string }).id === eventId);
  return (event as ObservationEvent<BrowserObservation> | undefined)
    ?.observation.screenshot_data;
};

const mockUserMessageEvent: MessageEvent = {
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

describe("useEventStore", () => {
  beforeEach(() => {
    useEventStore.setState({
      events: [],
      eventIds: new Set(),
      uiEvents: [],
      loadedConversationId: null,
    });
  });

  it("should render initial state correctly", () => {
    const { result } = renderHook(() => useEventStore());
    expect(result.current.events).toEqual([]);
  });

  it("should add an event to the store", () => {
    const { result } = renderHook(() => useEventStore());

    act(() => {
      result.current.addEvent(mockUserMessageEvent);
    });

    expect(result.current.events).toEqual([mockUserMessageEvent]);
  });

  it("should retrieve events whose actions are replaced by their observations", () => {
    const { result } = renderHook(() => useEventStore());

    act(() => {
      result.current.addEvent(mockUserMessageEvent);
      result.current.addEvent(mockActionEvent);
      result.current.addEvent(mockObservationEvent);
    });

    expect(result.current.uiEvents).toEqual([
      mockUserMessageEvent,
      mockObservationEvent,
    ]);
  });

  it("should bulk-add events and sort them chronologically", () => {
    const { result } = renderHook(() => useEventStore());

    const newest = {
      id: "evt-newest",
      timestamp: "2024-03-01T00:00:00Z",
      source: "user",
    } as any;
    const middle = {
      id: "evt-middle",
      timestamp: "2024-02-01T00:00:00Z",
      source: "user",
    } as any;
    const oldest = {
      id: "evt-oldest",
      timestamp: "2024-01-01T00:00:00Z",
      source: "user",
    } as any;

    // Seed with the newest event, then bulk-prepend older ones (the
    // pagination-on-scroll case). The store should re-sort chronologically.
    act(() => {
      result.current.addEvent(newest);
      result.current.addEvents([oldest, middle]);
    });

    expect(result.current.events.map((e) => (e as any).id)).toEqual([
      "evt-oldest",
      "evt-middle",
      "evt-newest",
    ]);
  });

  it("should de-duplicate events on bulk add", () => {
    const { result } = renderHook(() => useEventStore());

    act(() => {
      result.current.addEvent(mockUserMessageEvent);
      result.current.addEvents([mockUserMessageEvent, mockActionEvent]);
    });

    expect(result.current.events).toHaveLength(2);
  });

  it("should apply action-to-observation UI replacement during bulk add", () => {
    const { result } = renderHook(() => useEventStore());

    act(() => {
      result.current.addEvents([
        mockUserMessageEvent,
        mockActionEvent,
        mockObservationEvent,
      ]);
    });

    expect(result.current.uiEvents).toEqual([
      mockUserMessageEvent,
      mockObservationEvent,
    ]);
  });

  it("should clear all events when clearEvents is called", () => {
    const { result } = renderHook(() => useEventStore());

    // Add some events first
    act(() => {
      result.current.addEvent(mockUserMessageEvent);
      result.current.addEvent(mockActionEvent);
    });

    // Verify events were added
    expect(result.current.events).toHaveLength(2);
    expect(result.current.uiEvents).toHaveLength(2);

    // Clear events
    act(() => {
      result.current.clearEvents();
    });

    // Verify events were cleared
    expect(result.current.events).toEqual([]);
    expect(result.current.uiEvents).toEqual([]);
  });

  it("strips browser screenshot payloads from the retained copy on addEvent", () => {
    const { result } = renderHook(() => useEventStore());

    act(() => {
      result.current.addEvent(makeBrowserObservation());
    });

    expect(storedScreenshot("obs-browser-1")).toBeNull();
  });

  it("strips browser screenshot payloads on bulk addEvents", () => {
    const { result } = renderHook(() => useEventStore());

    act(() => {
      result.current.addEvents([makeBrowserObservation()]);
    });

    expect(storedScreenshot("obs-browser-1")).toBeNull();
  });

  it("does not mutate the caller's event when stripping", () => {
    // The WebSocket handler reads screenshot_data off the same object after
    // handing it to the store (to populate the live Browser tab), so the store
    // must strip a copy, never mutate the incoming event.
    const { result } = renderHook(() => useEventStore());
    const incoming = makeBrowserObservation();

    act(() => {
      result.current.addEvent(incoming);
    });

    expect(incoming.observation.screenshot_data).toBe("BASE64_SCREENSHOT_BLOB");
  });

  it("still de-duplicates browser observations by id after stripping", () => {
    const { result } = renderHook(() => useEventStore());

    act(() => {
      result.current.addEvent(makeBrowserObservation());
      result.current.addEvents([makeBrowserObservation()]);
    });

    expect(result.current.events).toHaveLength(1);
  });
});
