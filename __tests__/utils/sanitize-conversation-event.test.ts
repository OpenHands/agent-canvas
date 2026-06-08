import { describe, it, expect } from "vitest";
import {
  stripHeavyEventPayloads,
  stripHeavyEventPayloadsFromList,
} from "#/utils/sanitize-conversation-event";
import type {
  MessageEvent,
  ObservationEvent,
} from "#/types/agent-server/core";
import type {
  BrowserObservation,
  ExecuteBashObservation,
} from "#/types/agent-server/core/base/observation";

const makeBrowserObservation = (
  screenshotData: string | null,
): ObservationEvent<BrowserObservation> => ({
  id: "obs-browser-1",
  timestamp: "2024-01-01T00:00:00Z",
  source: "environment",
  tool_name: "browser",
  tool_call_id: "call_browser_1",
  action_id: "act-browser-1",
  observation: {
    kind: "BrowserObservation",
    output: "navigated to https://example.com",
    error: null,
    screenshot_data: screenshotData,
  },
});

const makeBashObservation = (): ObservationEvent<ExecuteBashObservation> => ({
  id: "obs-bash-1",
  timestamp: "2024-01-01T00:00:01Z",
  source: "environment",
  tool_name: "execute_bash",
  tool_call_id: "call_bash_1",
  action_id: "act-bash-1",
  observation: {
    kind: "ExecuteBashObservation",
    content: [{ type: "text", text: "hello\n" }],
    command: "echo hello",
    exit_code: 0,
    error: false,
    timeout: false,
    metadata: {} as never,
  },
});

const makeUserMessage = (): MessageEvent => ({
  id: "msg-1",
  timestamp: "2024-01-01T00:00:02Z",
  source: "user",
  llm_message: { role: "user", content: [{ type: "text", text: "hi" }] },
  activated_microagents: [],
  extended_content: [],
});

describe("stripHeavyEventPayloads", () => {
  it("nulls screenshot_data on a browser observation and returns a new object", () => {
    const event = makeBrowserObservation("BASE64_SCREENSHOT_BLOB");

    const result = stripHeavyEventPayloads(event);

    // A fresh copy is returned (so the retained history copy is distinct from
    // the raw event the WebSocket handler still reads for the Browser tab).
    expect(result).not.toBe(event);
    expect(result.observation).not.toBe(event.observation);
    expect(result.observation.screenshot_data).toBeNull();
  });

  it("does not mutate the input event — the raw payload survives for live panels", () => {
    // This is the invariant the Browser tab depends on: the WebSocket handler
    // reads screenshot_data off the same event object after handing it to the
    // store, so stripping must never mutate in place.
    const event = makeBrowserObservation("BASE64_SCREENSHOT_BLOB");

    stripHeavyEventPayloads(event);

    expect(event.observation.screenshot_data).toBe("BASE64_SCREENSHOT_BLOB");
  });

  it("preserves event identity, links, and visible text when stripping", () => {
    const event = makeBrowserObservation("BASE64_SCREENSHOT_BLOB");

    const result = stripHeavyEventPayloads(event);

    expect(result.id).toBe(event.id);
    expect(result.timestamp).toBe(event.timestamp);
    expect(result.action_id).toBe(event.action_id);
    expect(result.tool_call_id).toBe(event.tool_call_id);
    expect(result.observation.output).toBe(event.observation.output);
    expect(result.observation.error).toBe(event.observation.error);
  });

  it("returns the same reference for non-browser events", () => {
    const event = makeBashObservation();
    expect(stripHeavyEventPayloads(event)).toBe(event);

    const message = makeUserMessage();
    expect(stripHeavyEventPayloads(message)).toBe(message);
  });

  it("returns the same reference for a browser observation without a screenshot", () => {
    const withNull = makeBrowserObservation(null);
    expect(stripHeavyEventPayloads(withNull)).toBe(withNull);

    // An empty string is falsy too — nothing heavy to strip, so no churn.
    const withEmpty = makeBrowserObservation("");
    expect(stripHeavyEventPayloads(withEmpty)).toBe(withEmpty);
  });
});

describe("stripHeavyEventPayloadsFromList", () => {
  it("preserves order and length, stripping only the heavy entries", () => {
    const bash = makeBashObservation();
    const browser = makeBrowserObservation("BASE64_SCREENSHOT_BLOB");
    const message = makeUserMessage();

    const result = stripHeavyEventPayloadsFromList([bash, browser, message]);

    expect(result).toHaveLength(3);
    // Untouched entries are returned by reference; only the browser obs is a
    // new, stripped object.
    expect(result[0]).toBe(bash);
    expect(result[2]).toBe(message);
    expect(result[1]).not.toBe(browser);
    expect(
      (result[1] as ObservationEvent<BrowserObservation>).observation
        .screenshot_data,
    ).toBeNull();
    // The source list is left untouched.
    expect(browser.observation.screenshot_data).toBe("BASE64_SCREENSHOT_BLOB");
  });
});
