import { describe, expect, it } from "vitest";
import * as mcpRoute from "#/routes/mcp";

describe("mcp route", () => {
  it("does not gate the MCP page behind an ACP redirect", () => {
    // ACP agents now forward ``mcp_config`` to their subprocess at session
    // creation, so the MCP page is meaningful under ACP. Unlike /settings and
    // /settings/condenser (which stay inert for ACP and keep their
    // ``redirectIfAcpActive`` clientLoader), /mcp must NOT export a
    // clientLoader that bounces ACP users away.
    expect("clientLoader" in mcpRoute).toBe(false);
  });
});
