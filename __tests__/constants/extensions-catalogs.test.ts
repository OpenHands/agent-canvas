import { describe, expect, it } from "vitest";
import { AUTOMATION_CATALOG } from "@openhands/extensions/automations";
import { INTEGRATION_LOGOS } from "@openhands/extensions/integrations/logos";
import { INTEGRATION_CATALOG } from "@openhands/extensions/integrations";
import {
  getDefaultMcpTransport,
  getMcpMarketplaceCatalog,
} from "#/utils/mcp-marketplace-utils";

describe("OpenHands extensions catalogs", () => {
  it("hydrates the MCP marketplace from @openhands/extensions", () => {
    expect(INTEGRATION_CATALOG.length).toBeGreaterThan(0);

    const github = INTEGRATION_CATALOG.find((entry) => entry.id === "github");
    expect(getDefaultMcpTransport(github!)?.kind).toBe("shttp");
    expect(INTEGRATION_LOGOS.github).toBeTruthy();
  });

  it("patches Slack to the maintained docs and npm package", () => {
    const slack = INTEGRATION_CATALOG.find((entry) => entry.id === "slack");
    expect(slack?.docsUrl).toBe(
      "https://github.com/zencoderai/slack-mcp-server",
    );
    const apiOption = slack?.connectionOptions.find(
      (option) => option.id === "api" && option.transport?.kind === "stdio",
    );
    expect(apiOption?.transport?.kind).toBe("stdio");
    if (apiOption?.transport?.kind !== "stdio") {
      throw new Error("Slack API option should be stdio");
    }
    expect(apiOption.transport.args).toContain("@zencoderai/slack-mcp-server");
    expect(apiOption.transport.args).not.toContain(
      "@modelcontextprotocol/server-slack",
    );
  });

  it("patches Linear to the streamable HTTP /mcp endpoint with bearer auth", () => {
    // Arrange: upstream still ships the removed /sse SSE transport; the
    // marketplace catalog must serve the patched entry instead.
    const catalog = getMcpMarketplaceCatalog(INTEGRATION_CATALOG);

    // Act
    const linear = catalog.find((entry) => entry.id === "linear")!;

    // Assert
    expect(getDefaultMcpTransport(linear)).toEqual({
      kind: "shttp",
      url: "https://mcp.linear.app/mcp",
      apiKeyOptional: true,
    });
    expect(linear.docsUrl).toBe("https://linear.app/docs/mcp");
    const mcpOption = linear.connectionOptions.find(
      (option) => option.transport?.kind === "shttp",
    );
    expect(mcpOption?.auth.strategy).toBe("bearer");
  });

  it("does not mutate the imported catalog when patching Linear", () => {
    // Arrange/Act: run the patch, then inspect the raw imported entry.
    getMcpMarketplaceCatalog(INTEGRATION_CATALOG);
    const raw = INTEGRATION_CATALOG.find((entry) => entry.id === "linear");

    // Assert: the shared JSON module still carries the upstream values.
    const rawOption = raw?.connectionOptions.find(
      (option) => option.transport?.kind === "sse",
    );
    expect(rawOption?.transport).toEqual({
      kind: "sse",
      url: "https://mcp.linear.app/sse",
      apiKeyOptional: true,
    });
  });

  it("drops deprecated MCP entries that no longer have maintained replacements", () => {
    const catalogIds = new Set(
      getMcpMarketplaceCatalog(INTEGRATION_CATALOG).map((entry) => entry.id),
    );

    expect(catalogIds.has("gitlab")).toBe(false);
    expect(catalogIds.has("google-maps")).toBe(false);
    expect(catalogIds.has("postgres")).toBe(false);
    expect(catalogIds.has("puppeteer")).toBe(false);
    expect(catalogIds.has("sqlite")).toBe(false);
  });

  it("loads recommended automations from @openhands/extensions", () => {
    expect(AUTOMATION_CATALOG.length).toBeGreaterThan(0);

    const knownMcpIds = new Set(INTEGRATION_CATALOG.map((entry) => entry.id));
    for (const automation of AUTOMATION_CATALOG) {
      expect(automation.requiredIntegrationIds.length).toBeGreaterThan(0);
      expect(
        automation.requiredIntegrationIds.every((id) => knownMcpIds.has(id)),
      ).toBe(true);
    }
  });
});
