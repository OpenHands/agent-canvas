import { MCPServerConfig } from "#/types/mcp-server";
import {
  MarketplaceEntry,
  MarketplaceTemplate,
} from "#/constants/mcp-marketplace";
import { Settings } from "#/types/settings";

const tryUrl = (raw: string): URL | null => {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

/**
 * Loose URL match that ignores query strings, trailing slashes, and
 * default ports. We want clicking "Linear" to flag the entry as
 * installed even if the user pasted the URL with extra trailing slash
 * or a different port-equivalent variant.
 */
function urlsMatch(a: string, b: string): boolean {
  const left = tryUrl(a);
  const right = tryUrl(b);
  if (!left || !right) return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
  return (
    left.protocol === right.protocol &&
    left.host === right.host &&
    left.pathname.replace(/\/+$/, "") === right.pathname.replace(/\/+$/, "")
  );
}

/**
 * Decide whether a marketplace template is already represented by one
 * of the installed MCP servers. Used to render an "Installed" badge on
 * the marketplace tile.
 */
export function findInstalledMatch(
  template: MarketplaceTemplate,
  servers: MCPServerConfig[],
  settings?: Pick<Settings, "search_api_key_set">,
): MCPServerConfig | "tavily-builtin" | null {
  if (template.kind === "tavily-builtin") {
    return settings?.search_api_key_set ? "tavily-builtin" : null;
  }

  if (template.kind === "shttp") {
    const match = servers.find(
      (s) => s.type === "shttp" && s.url && urlsMatch(s.url, template.url),
    );
    return match ?? null;
  }

  if (template.kind === "sse") {
    const match = servers.find(
      (s) => s.type === "sse" && s.url && urlsMatch(s.url, template.url),
    );
    return match ?? null;
  }

  // stdio: match on the registered server name.
  const match = servers.find(
    (s) => s.type === "stdio" && s.name === template.serverName,
  );
  return match ?? null;
}

export function isMarketplaceEntryAvailable(
  entry: MarketplaceEntry,
  backendKind: "local" | "cloud",
): boolean {
  if (!entry.availability || entry.availability === "all") return true;
  return entry.availability === backendKind;
}
