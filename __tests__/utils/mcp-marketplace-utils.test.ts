import { describe, expect, it } from "vitest";
import {
  findInstalledMatch,
  isMarketplaceEntryAvailable,
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
    expect(findInstalledMatch(tavilyEntry.template, [], { search_api_key_set: true })).toBe(
      "tavily-builtin",
    );
    expect(findInstalledMatch(tavilyEntry.template, [], { search_api_key_set: false })).toBeNull();
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
