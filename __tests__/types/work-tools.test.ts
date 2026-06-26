import { describe, expect, it, vi } from "vitest";
import {
  parseWorkOptionalToolIds,
  parseWorkToolRequests,
  resolveWorkAgentToolNames,
  serializeWorkOptionalToolIds,
  stripWorkToolRequests,
} from "#/types/work-tools";

vi.mock("#/api/agent-server-compatibility", () => ({
  isAgentServerToolAvailable: (name: string) => name === "browser_tool_set",
}));

describe("work-tools", () => {
  it("serializes and parses optional tool ids", () => {
    expect(serializeWorkOptionalToolIds(["browser", "browser"])).toBe("browser");
    expect(parseWorkOptionalToolIds("browser,unknown")).toEqual(["browser"]);
  });

  it("resolves base and optional agent tool names", () => {
    expect(resolveWorkAgentToolNames([])).toEqual([
      "file_editor",
      "task_tracker",
      "canvas_ui",
    ]);
    expect(resolveWorkAgentToolNames(["browser"])).toEqual([
      "file_editor",
      "task_tracker",
      "canvas_ui",
      "browser_tool_set",
    ]);
  });

  it("parses and strips WORK_TOOL_REQUEST tags", () => {
    const text =
      'Need web access.\n<WORK_TOOL_REQUEST tool="browser" reason="Look up tax rates"/>';
    expect(parseWorkToolRequests(text)).toEqual([
      { toolId: "browser", reason: "Look up tax rates" },
    ]);
    expect(stripWorkToolRequests(text)).toBe("Need web access.");
  });
});
