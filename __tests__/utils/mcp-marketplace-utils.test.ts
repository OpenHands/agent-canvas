import { describe, expect, it } from "vitest";
import {
  findCatalogEntryForServer,
  findInstalledMatch,
  installedServerMatchesQuery,
  isMarketplaceEntryAvailable,
  marketplaceEntryMatchesQuery,
} from "#/utils/mcp-marketplace-utils";
import { MCP_CATALOG as MCP_MARKETPLACE } from "@openhands/extensions/mcps";

const slackEntry = MCP_MARKETPLACE.find((e) => e.id === "slack")!;
const tavilyEntry = MCP_MARKETPLACE.find((e) => e.id === "tavily")!;
const linearEntry = MCP_MARKETPLACE.find((e) => e.id === "linear")!;
const filesystemEntry = MCP_MARKETPLACE.find((e) => e.id === "filesystem")!;

describe("findInstalledMatch", () => {
  it("matches stdio servers by name", () => {
    const result = findInstalledMatch(slackEntry.template, [
      {
        id: "stdio-0",
        type: "stdio",
        name: "slack",
        command: "npx",
        args: ["-y", "@zencoderai/slack-mcp-server"],
      },
    ]);
    expect(result).toEqual(expect.objectContaining({ id: "stdio-0" }));
  });

  it("does not match a different stdio name", () => {
    const result = findInstalledMatch(slackEntry.template, [
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
    const result = findInstalledMatch(tavilyEntry.template, [
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
    const result = findInstalledMatch(linearEntry.template, [
      {
        id: "sse-0",
        type: "sse",
        url: "https://mcp.linear.app/sse/",
      },
    ]);
    expect(result).toEqual(expect.objectContaining({ id: "sse-0" }));
  });

  it("returns null when servers carry malformed urls (defensive)", () => {
    const result = findInstalledMatch(linearEntry.template, [
      // Cast to any to simulate runtime data slipping past the type.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "sse-0", type: "sse", url: undefined as any },
    ]);
    expect(result).toBeNull();
  });
});

describe("isMarketplaceEntryAvailable", () => {
  it("treats unset availability as 'all'", () => {
    expect(isMarketplaceEntryAvailable(slackEntry, "local")).toBe(true);
    expect(isMarketplaceEntryAvailable(slackEntry, "cloud")).toBe(true);
  });

  it("hides local-only entries on cloud", () => {
    expect(isMarketplaceEntryAvailable(filesystemEntry, "local")).toBe(true);
    expect(isMarketplaceEntryAvailable(filesystemEntry, "cloud")).toBe(false);
  });
});

describe("marketplaceEntryMatchesQuery", () => {
  it("matches by name (case-insensitive)", () => {
    expect(marketplaceEntryMatchesQuery(slackEntry, "slack")).toBe(true);
    expect(marketplaceEntryMatchesQuery(slackEntry, "SLACK")).toBe(true);
  });

  it("matches by keyword", () => {
    expect(marketplaceEntryMatchesQuery(slackEntry, "messaging")).toBe(true);
  });

  it("matches by substring of description", () => {
    expect(marketplaceEntryMatchesQuery(tavilyEntry, "web search")).toBe(true);
  });

  it("returns true for empty/whitespace queries", () => {
    expect(marketplaceEntryMatchesQuery(slackEntry, "")).toBe(true);
    expect(marketplaceEntryMatchesQuery(slackEntry, "   ")).toBe(true);
  });

  it("returns false for non-matches", () => {
    expect(marketplaceEntryMatchesQuery(slackEntry, "zzzz-no-match")).toBe(
      false,
    );
  });
});

describe("installedServerMatchesQuery", () => {
  const slackServer = {
    id: "stdio-0",
    type: "stdio" as const,
    name: "slack",
    command: "npx",
    args: ["-y", "@zencoderai/slack-mcp-server"],
  };

  it("matches by stdio server name", () => {
    expect(installedServerMatchesQuery(slackServer, undefined, "slack")).toBe(
      true,
    );
  });

  it("matches via the catalog entry's name even if server.name differs", () => {
    const renamed = { ...slackServer, name: "my-slack-instance" };
    expect(installedServerMatchesQuery(renamed, slackEntry, "slack")).toBe(
      true,
    );
  });

  it("matches by url for shttp/sse servers", () => {
    const sseServer = {
      id: "sse-0",
      type: "sse" as const,
      url: "https://mcp.linear.app/sse",
    };
    expect(installedServerMatchesQuery(sseServer, undefined, "linear")).toBe(
      true,
    );
  });

  it("empty query always matches", () => {
    expect(installedServerMatchesQuery(slackServer, undefined, "")).toBe(true);
  });
});

describe("findCatalogEntryForServer", () => {
  it("finds the Slack catalog entry for an installed Slack stdio server", () => {
    const match = findCatalogEntryForServer(
      {
        id: "stdio-0",
        type: "stdio",
        name: "slack",
        command: "npx",
        args: [],
      },
      MCP_MARKETPLACE,
    );
    expect(match?.id).toBe("slack");
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
        MCP_MARKETPLACE,
      ),
    ).toBeUndefined();
  });

  it("matches an SSE server whose URL differs only by trailing slash", () => {
    // Regression coverage for the strict-=== URL match that previously
    // diverged from findInstalledMatch and caused installed cards to
    // render the generic icon while the marketplace tile said
    // "Installed".
    const linear = MCP_MARKETPLACE.find((e) => e.id === "linear")!;
    if (linear.template.kind !== "sse") {
      throw new Error("Linear template should be SSE");
    }
    const normalizedUrl = linear.template.url.replace(/\/$/, "");
    const match = findCatalogEntryForServer(
      { id: "sse-0", type: "sse", url: `${normalizedUrl}/` },
      MCP_MARKETPLACE,
    );
    expect(match?.id).toBe("linear");
  });
});
