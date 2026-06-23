import { describe, it, expect } from "vitest";
import {
  computeGroupElapsedMs,
  countChangedFiles,
  formatElapsed,
} from "#/components/conversation-events/chat/event-message-components/event-group-summary";
import {
  ActionEvent,
  ObservationEvent,
  OpenHandsEvent,
  SecurityRisk,
} from "#/types/agent-server/core";
import {
  FileEditorAction,
  StrReplaceEditorAction,
} from "#/types/agent-server/core/base/action";

const makeFileEditAction = (
  id: string,
  path: string,
  command: FileEditorAction["command"] = "str_replace",
  timestamp = "2026-01-01T00:00:00.000Z",
): ActionEvent<FileEditorAction> => ({
  id,
  timestamp,
  source: "agent",
  thought: [],
  thinking_blocks: [],
  action: {
    kind: "FileEditorAction",
    command,
    path,
    file_text: null,
  } as FileEditorAction,
  tool_name: "file_editor",
  tool_call_id: `call_${id}`,
  tool_call: {
    id: `call_${id}`,
    type: "function",
    function: { name: "file_editor", arguments: "{}" },
  },
  llm_response_id: `response_${id}`,
  security_risk: SecurityRisk.UNKNOWN,
});

const makeStrReplaceObservation = (
  id: string,
  actionId: string,
  timestamp = "2026-01-01T00:00:05.000Z",
): ObservationEvent => ({
  id,
  timestamp,
  source: "environment",
  tool_name: "str_replace_editor",
  tool_call_id: `call_${actionId}`,
  action_id: actionId,
  observation: {
    kind: "FileEditorObservation",
    content: [{ type: "text", text: "ok" }],
  } as never,
});

describe("formatElapsed", () => {
  it("formats sub-minute durations in seconds", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(12_000)).toBe("12s");
    expect(formatElapsed(59_400)).toBe("59s");
  });

  it("formats whole minutes without trailing seconds", () => {
    expect(formatElapsed(60_000)).toBe("1m");
    expect(formatElapsed(120_000)).toBe("2m");
  });

  it("formats minutes and seconds together", () => {
    expect(formatElapsed(65_000)).toBe("1m 5s");
    expect(formatElapsed(185_000)).toBe("3m 5s");
  });
});

describe("computeGroupElapsedMs", () => {
  const events: OpenHandsEvent[] = [
    makeFileEditAction("a1", "/a.ts", "str_replace", "2026-01-01T00:00:00.000Z"),
    makeStrReplaceObservation("o1", "a1", "2026-01-01T00:00:08.000Z"),
  ];

  it("spans first-to-last timestamp once settled", () => {
    expect(computeGroupElapsedMs(events, false, Date.parse("2026-06-01"))).toBe(
      8_000,
    );
  });

  it("measures up to now while running", () => {
    const running: OpenHandsEvent[] = [
      makeFileEditAction(
        "a1",
        "/a.ts",
        "str_replace",
        "2026-01-01T00:00:00.000Z",
      ),
    ];
    const now = Date.parse("2026-01-01T00:00:03.000Z");
    expect(computeGroupElapsedMs(running, true, now)).toBe(3_000);
  });

  it("returns 0 for an empty group", () => {
    expect(computeGroupElapsedMs([], false, Date.now())).toBe(0);
  });
});

describe("countChangedFiles", () => {
  it("counts unique edited paths, resolving observations to their action", () => {
    const action = makeFileEditAction("a1", "/src/a.ts");
    const obs = makeStrReplaceObservation("o1", "a1");
    const allEvents: OpenHandsEvent[] = [action, obs];

    // The observation alone still resolves to one changed file.
    expect(countChangedFiles([obs], allEvents)).toBe(1);
  });

  it("dedupes repeated edits to the same path", () => {
    const a1 = makeFileEditAction("a1", "/src/a.ts");
    const a2 = makeFileEditAction("a2", "/src/a.ts");
    const a3 = makeFileEditAction("a3", "/src/b.ts");
    const events: OpenHandsEvent[] = [a1, a2, a3];
    expect(countChangedFiles(events, events)).toBe(2);
  });

  it("ignores view (read-only) file-editor commands", () => {
    const view = makeFileEditAction("a1", "/src/a.ts", "view");
    const edit = makeFileEditAction("a2", "/src/b.ts", "str_replace");
    const events: OpenHandsEvent[] = [view, edit];
    expect(countChangedFiles(events, events)).toBe(1);
  });

  it("counts StrReplaceEditorAction edits", () => {
    const strReplace: ActionEvent<StrReplaceEditorAction> = {
      ...makeFileEditAction("a1", "/src/c.ts"),
      action: {
        kind: "StrReplaceEditorAction",
        command: "str_replace",
        path: "/src/c.ts",
        file_text: null,
      } as StrReplaceEditorAction,
    };
    expect(countChangedFiles([strReplace], [strReplace])).toBe(1);
  });
});
