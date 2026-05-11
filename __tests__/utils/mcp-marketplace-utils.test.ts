import { describe, expect, it } from "vitest";
import {
  findCatalogEntryForServer,
  findInstalledMatch,
  installedServerMatchesQuery,
  isMarketplaceEntryAvailable,
  marketplaceEntryMatchesQuery,
} from "#/utils/mcp-marketplace-utils";
import { MCP_MARKETPLACE } from "#/constants/mcp-marketplace";

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
        args: ["-y", "@modelcontextprotocol/server-slack"],
      },
    ]);
    expect(result).toMatchObject({ id: "stdio-0" });
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

  it("returns the tavily-builtin sentinel when search_api_key_set", () => {
    expect(
      findInstalledMatch(tavilyEntry.template, [], {
        search_api_key_set: true,
      }),
    ).toBe("tavily-builtin");
    expect(
      findInstalledMatch(tavilyEntry.template, [], {
        search_api_key_set: false,
      }),
    ).toBeNull();
  });

  it("matches SSE servers loosely on URL", () => {
    const result = findInstalledMatch(linearEntry.template, [
      {
        id: "sse-0",
        type: "sse",
        url: "https://mcp.linear.app/sse/",
      },
    ]);
    expect(result).toMatchObject({ id: "sse-0" });
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
    args: ["-y", "@modelcontextprotocol/server-slack"],
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
});
