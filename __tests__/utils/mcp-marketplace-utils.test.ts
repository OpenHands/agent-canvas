import { describe, expect, it } from "vitest";
import {
  findCatalogEntryForServer,
  findInstalledMatch,
  getDefaultTemplate,
  installedServerMatchesQuery,
  isMarketplaceEntryAvailable,
  marketplaceEntryMatchesQuery,
} from "#/utils/mcp-marketplace-utils";
import {
  INTEGRATION_CATALOG as INTEGRATION_MARKETPLACE,
  type IntegrationCatalogEntry,
} from "@openhands/extensions/integrations";

const tavilyEntry = INTEGRATION_MARKETPLACE.find(
  (e: IntegrationCatalogEntry) => e.id === "tavily",
)!;
const filesystemEntry = INTEGRATION_MARKETPLACE.find(
  (e: IntegrationCatalogEntry) => e.id === "filesystem",
)!;
// Atlassian has an SSE server as the default MCP option
const atlassianEntry = INTEGRATION_MARKETPLACE.find(
  (e: IntegrationCatalogEntry) => e.id === "atlassian",
)!;

const tavilyTemplate = getDefaultTemplate(tavilyEntry)!;
const atlassianTemplate = getDefaultTemplate(atlassianEntry)!;

describe("findInstalledMatch", () => {
  it("matches stdio servers by name", () => {
    const result = findInstalledMatch(tavilyTemplate, [
      {
        id: "stdio-0",
        type: "stdio",
        name: "tavily",
        command: "npx",
        args: ["-y", "tavily-mcp"],
      },
    ]);
    expect(result).toEqual(expect.objectContaining({ id: "stdio-0" }));
  });

  it("does not match a different stdio name", () => {
    const result = findInstalledMatch(tavilyTemplate, [
      {
        id: "stdio-0",
        type: "stdio",
        name: "github",
        command: "npx",
        args: [],
      },
    ]);
    expect(result).toBeNull();
  });

  it("matches Tavily as a stdio server by name", () => {
    // Tavily lives in the catalog as a stdio MCP entry (the previous
    // tavily-builtin / search_api_key flow never persisted anywhere
    // and silently dropped the key); confirm the now-uniform match.
    const result = findInstalledMatch(tavilyTemplate, [
      {
        id: "stdio-0",
        type: "stdio",
        name: "tavily",
        command: "npx",
        args: ["-y", "tavily-mcp"],
        env: { TAVILY_API_KEY: "tvly-secret" },
      },
    ]);
    expect(result).toEqual(expect.objectContaining({ id: "stdio-0" }));
  });

  it("matches SSE servers loosely on URL", () => {
    // Atlassian has SSE as its default MCP transport
    const result = findInstalledMatch(atlassianTemplate, [
      {
        id: "sse-0",
        type: "sse",
        url: "https://mcp.atlassian.com/v1/sse/",
      },
    ]);
    expect(result).toEqual(expect.objectContaining({ id: "sse-0" }));
  });

  it("returns null when servers carry malformed urls (defensive)", () => {
    const result = findInstalledMatch(atlassianTemplate, [
      // Cast to any to simulate runtime data slipping past the type.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "sse-0", type: "sse", url: undefined as any },
    ]);
    expect(result).toBeNull();
  });
});

describe("isMarketplaceEntryAvailable", () => {
  it("treats unset availability as 'all'", () => {
    expect(isMarketplaceEntryAvailable(tavilyEntry, "local")).toBe(true);
    expect(isMarketplaceEntryAvailable(tavilyEntry, "cloud")).toBe(true);
  });

  it("hides local-only entries on cloud", () => {
    expect(isMarketplaceEntryAvailable(filesystemEntry, "local")).toBe(true);
    expect(isMarketplaceEntryAvailable(filesystemEntry, "cloud")).toBe(false);
  });
});

describe("marketplaceEntryMatchesQuery", () => {
  it("matches by name (case-insensitive)", () => {
    expect(marketplaceEntryMatchesQuery(tavilyEntry, "tavily")).toBe(true);
    expect(marketplaceEntryMatchesQuery(tavilyEntry, "TAVILY")).toBe(true);
  });

  it("matches by keyword", () => {
    expect(marketplaceEntryMatchesQuery(tavilyEntry, "search")).toBe(true);
  });

  it("matches by substring of description", () => {
    expect(marketplaceEntryMatchesQuery(tavilyEntry, "web search")).toBe(true);
  });

  it("returns true for empty/whitespace queries", () => {
    expect(marketplaceEntryMatchesQuery(tavilyEntry, "")).toBe(true);
    expect(marketplaceEntryMatchesQuery(tavilyEntry, "   ")).toBe(true);
  });

  it("returns false for non-matches", () => {
    expect(marketplaceEntryMatchesQuery(tavilyEntry, "zzzz-no-match")).toBe(
      false,
    );
  });
});

describe("installedServerMatchesQuery", () => {
  const tavilyServer = {
    id: "stdio-0",
    type: "stdio" as const,
    name: "tavily",
    command: "npx",
    args: ["-y", "tavily-mcp"],
  };

  it("matches by stdio server name", () => {
    expect(installedServerMatchesQuery(tavilyServer, undefined, "tavily")).toBe(
      true,
    );
  });

  it("matches via the catalog entry's name even if server.name differs", () => {
    const renamed = { ...tavilyServer, name: "my-tavily-instance" };
    expect(installedServerMatchesQuery(renamed, tavilyEntry, "tavily")).toBe(
      true,
    );
  });

  it("matches by url for shttp/sse servers", () => {
    const sseServer = {
      id: "sse-0",
      type: "sse" as const,
      url: "https://mcp.atlassian.com/v1/sse",
    };
    expect(installedServerMatchesQuery(sseServer, undefined, "atlassian")).toBe(
      true,
    );
  });

  it("empty query always matches", () => {
    expect(installedServerMatchesQuery(tavilyServer, undefined, "")).toBe(true);
  });
});

describe("findCatalogEntryForServer", () => {
  it("finds the Tavily catalog entry for an installed Tavily stdio server", () => {
    const match = findCatalogEntryForServer(
      {
        id: "stdio-0",
        type: "stdio",
        name: "tavily",
        command: "npx",
        args: [],
      },
      INTEGRATION_MARKETPLACE,
    );
    expect(match?.id).toBe("tavily");
  });

  it("returns undefined for unknown servers", () => {
    expect(
      findCatalogEntryForServer(
        {
          id: "stdio-0",
          type: "stdio",
          name: "unknown",
          command: "npx",
          args: [],
        },
        INTEGRATION_MARKETPLACE,
      ),
    ).toBeUndefined();
  });

  it("matches an SSE server whose URL differs only by trailing slash", () => {
    // Regression coverage for the strict-=== URL match that previously
    // diverged from findInstalledMatch and caused installed cards to
    // render the generic icon while the marketplace tile said
    // "Installed".
    // Atlassian has SSE as its default MCP transport
    if (atlassianTemplate?.kind !== "sse") {
      throw new Error("Atlassian template should be SSE");
    }
    const normalizedUrl = atlassianTemplate.url.replace(/\/$/, "");
    const match = findCatalogEntryForServer(
      { id: "sse-0", type: "sse", url: `${normalizedUrl}/` },
      INTEGRATION_MARKETPLACE,
    );
    expect(match?.id).toBe("atlassian");
  });
});
