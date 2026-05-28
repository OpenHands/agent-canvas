import { describe, expect, it } from "vitest";
import { AUTOMATION_CATALOG } from "@openhands/extensions/automations";
import {
  INTEGRATION_LOGO_IDS,
  INTEGRATION_LOGOS,
} from "@openhands/extensions/integrations/logos";
import {
  INTEGRATION_CATALOG,
  type IntegrationCatalogEntry,
} from "@openhands/extensions/integrations";
import { getDefaultTemplate } from "#/utils/mcp-marketplace-utils";

describe("OpenHands extensions catalogs", () => {
  it("hydrates the integration marketplace from @openhands/extensions", () => {
    expect(INTEGRATION_CATALOG.length).toBeGreaterThan(0);

    // Tavily has stdio as its default MCP transport
    const tavily = INTEGRATION_CATALOG.find(
      (entry: IntegrationCatalogEntry) => entry.id === "tavily",
    );
    const tavilyTemplate = tavily ? getDefaultTemplate(tavily) : undefined;
    expect(tavilyTemplate?.kind).toBe("stdio");
    expect(INTEGRATION_LOGOS.tavily).toBeTruthy();

    // Not all integrations have logos (some may be HTTP-only), so we just
    // check that the logo collection is populated
    expect(INTEGRATION_LOGO_IDS.size).toBeGreaterThan(0);
  });

  it("includes Slack with OAuth as default and stdio fallback", () => {
    const slack = INTEGRATION_CATALOG.find(
      (entry: IntegrationCatalogEntry) => entry.id === "slack",
    );
    expect(slack).toBeDefined();
    // Slack's default is now OAuth/shttp
    const defaultTemplate = slack ? getDefaultTemplate(slack) : undefined;
    expect(defaultTemplate?.kind).toBe("shttp");

    // But the stdio option with the maintained npm package is still available
    const stdioOption = slack?.connectionOptions.find((o) => o.id === "api");
    expect(stdioOption?.transport?.kind).toBe("stdio");
    if (stdioOption?.transport?.kind === "stdio") {
      expect(stdioOption.transport.args).toContain(
        "@zencoderai/slack-mcp-server",
      );
    }
  });

  it("includes common integrations in the catalog", () => {
    const catalogIds = new Set(
      INTEGRATION_CATALOG.map((entry: IntegrationCatalogEntry) => entry.id),
    );

    // These should all be present
    expect(catalogIds.has("github")).toBe(true);
    expect(catalogIds.has("slack")).toBe(true);
    expect(catalogIds.has("tavily")).toBe(true);
    expect(catalogIds.has("linear")).toBe(true);
    expect(catalogIds.has("notion")).toBe(true);
  });

  it("loads recommended automations from @openhands/extensions", () => {
    expect(AUTOMATION_CATALOG.length).toBeGreaterThan(0);

    const knownIntegrationIds = new Set(
      INTEGRATION_CATALOG.map((entry: IntegrationCatalogEntry) => entry.id),
    );
    for (const automation of AUTOMATION_CATALOG) {
      expect(automation.requiredIntegrationIds.length).toBeGreaterThan(0);
      expect(
        automation.requiredIntegrationIds.every((id: string) =>
          knownIntegrationIds.has(id),
        ),
      ).toBe(true);
    }
  });
});
