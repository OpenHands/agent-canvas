import { describe, expect, it } from "vitest";
import { AUTOMATION_CATALOG } from "@openhands/extensions/automations";
import { MCP_LOGO_IDS, MCP_LOGOS } from "@openhands/extensions/mcps/logos";
import { MCP_CATALOG } from "@openhands/extensions/mcps";

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

  it("patches Slack to the maintained docs and npm package", () => {
    const slack = MCP_CATALOG.find((entry) => entry.id === "slack");
    expect(slack?.docsUrl).toBe(
      "https://github.com/zencoderai/slack-mcp-server",
    );
    expect(slack?.template.kind).toBe("stdio");
    if (slack?.template.kind !== "stdio") {
      throw new Error("Slack template should be stdio");
    }
    expect(slack.template.args).toContain("@zencoderai/slack-mcp-server");
    expect(slack.template.args).not.toContain(
      "@modelcontextprotocol/server-slack",
    );
  });

  it("drops deprecated MCP entries that no longer have maintained replacements", () => {
    const catalogIds = new Set(MCP_CATALOG.map((entry) => entry.id));

    expect(catalogIds.has("gitlab")).toBe(false);
    expect(catalogIds.has("google-maps")).toBe(false);
    expect(catalogIds.has("postgres")).toBe(false);
    expect(catalogIds.has("puppeteer")).toBe(false);
    expect(catalogIds.has("sqlite")).toBe(false);
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
