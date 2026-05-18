import { describe, expect, it } from "vitest";
import { AUTOMATION_CATALOG } from "@openhands/extensions/automations";
import { MCP_CATALOG } from "@openhands/extensions/mcps";
import { MCP_LOGO_IDS, MCP_LOGOS } from "@openhands/extensions/mcps/logos";

describe("OpenHands extensions catalogs", () => {
  it("hydrates the MCP marketplace from @openhands/extensions", () => {
    expect(MCP_CATALOG.length).toBeGreaterThan(0);

    const github = MCP_CATALOG.find((entry) => entry.id === "github");
    expect(github?.template.kind).toBe("stdio");
    expect(MCP_LOGOS.github).toBeTruthy();

    for (const entry of MCP_CATALOG) {
      expect(MCP_LOGO_IDS.has(entry.id)).toBe(true);
    }
  });

  it("loads recommended automations from @openhands/extensions", () => {
    expect(AUTOMATION_CATALOG.length).toBeGreaterThan(0);

    const knownMcpIds = new Set(MCP_CATALOG.map((entry) => entry.id));
    for (const automation of AUTOMATION_CATALOG) {
      expect(automation.requiredMcpIds.length).toBeGreaterThan(0);
      expect(automation.requiredMcpIds.every((id) => knownMcpIds.has(id))).toBe(
        true,
      );
    }
  });
});
