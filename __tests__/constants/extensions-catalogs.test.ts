import { describe, expect, it } from "vitest";
import { MCP_CATALOG } from "@openhands/extensions/mcps";
import { AUTOMATION_CATALOG } from "@openhands/extensions/automations";
import { MCP_LOGO_IDS, MCP_MARKETPLACE } from "#/constants/mcp-marketplace";
import { RECOMMENDED_AUTOMATIONS } from "#/constants/recommended-automations";

describe("OpenHands extensions catalogs", () => {
  it("hydrates the MCP marketplace from @openhands/extensions", () => {
    expect(MCP_CATALOG.length).toBeGreaterThan(0);
    expect(MCP_MARKETPLACE).toHaveLength(MCP_CATALOG.length);

    const github = MCP_MARKETPLACE.find((entry) => entry.id === "github");
    expect(github?.template.kind).toBe("stdio");
    expect(github?.logo).toBeTruthy();

    for (const entry of MCP_CATALOG) {
      expect(MCP_LOGO_IDS.has(entry.id)).toBe(true);
    }
  });

  it("loads recommended automations from @openhands/extensions", () => {
    expect(AUTOMATION_CATALOG.length).toBeGreaterThan(0);
    expect(RECOMMENDED_AUTOMATIONS).toEqual(AUTOMATION_CATALOG);

    const knownMcpIds = new Set(MCP_MARKETPLACE.map((entry) => entry.id));
    for (const automation of RECOMMENDED_AUTOMATIONS) {
      expect(automation.requiredMcpIds.length).toBeGreaterThan(0);
      expect(automation.requiredMcpIds.every((id) => knownMcpIds.has(id))).toBe(
        true,
      );
    }
  });
});
