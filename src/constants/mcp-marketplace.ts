import {
  MCP_CATALOG as UPSTREAM_MCP_CATALOG,
  type McpCatalogEntry,
} from "@openhands/extensions/mcps";

const LEGACY_SLACK_PACKAGE = "@modelcontextprotocol/server-slack";
const MAINTAINED_SLACK_PACKAGE = "@zencoderai/slack-mcp-server";
const MAINTAINED_SLACK_DOCS_URL =
  "https://github.com/zencoderai/slack-mcp-server";

function patchSlackEntry(entry: McpCatalogEntry): McpCatalogEntry {
  if (entry.id !== "slack" || entry.template.kind !== "stdio") {
    return entry;
  }

  return {
    ...entry,
    docsUrl: MAINTAINED_SLACK_DOCS_URL,
    template: {
      ...entry.template,
      args: entry.template.args.map((arg) =>
        arg === LEGACY_SLACK_PACKAGE ? MAINTAINED_SLACK_PACKAGE : arg,
      ),
    },
  };
}

export const MCP_CATALOG: McpCatalogEntry[] =
  UPSTREAM_MCP_CATALOG.map(patchSlackEntry);

export type { McpCatalogEntry };
