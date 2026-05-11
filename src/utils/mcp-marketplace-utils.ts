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

function normalize(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Case-insensitive substring match against the catalog entry's
 * user-visible identity (name, description, id, keywords). Empty
 * queries always match.
 */
export function marketplaceEntryMatchesQuery(
  entry: MarketplaceEntry,
  rawQuery: string,
): boolean {
  const q = normalize(rawQuery);
  if (!q) return true;
  const haystack = [
    entry.name,
    entry.description,
    entry.id,
    ...(entry.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * Search match for an installed (already-configured) server. We
 * search the server's own identifying fields and — if it's a catalog
 * entry — its catalog name/keywords too, so typing "Slack" matches
 * the installed Slack tile even though the persisted server is just
 * `{ type: "stdio", name: "slack", ... }`.
 */
export function installedServerMatchesQuery(
  server: MCPServerConfig,
  catalogEntry: MarketplaceEntry | undefined,
  rawQuery: string,
): boolean {
  const q = normalize(rawQuery);
  if (!q) return true;
  const haystack = [
    server.type,
    "name" in server ? server.name : undefined,
    "command" in server ? server.command : undefined,
    "args" in server ? server.args?.join(" ") : undefined,
    "url" in server ? server.url : undefined,
    catalogEntry?.name,
    catalogEntry?.description,
    catalogEntry?.id,
    ...(catalogEntry?.keywords ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * Look up the catalog entry that best matches an installed server.
 * Mirrors the lookup used in `installed-server-card.tsx` for
 * rendering the friendly icon.
 */
export function findCatalogEntryForServer(
  server: MCPServerConfig,
  catalog: MarketplaceEntry[],
): MarketplaceEntry | undefined {
  return catalog.find((entry) => {
    const tpl = entry.template;
    if (tpl.kind === "tavily-builtin") return false;
    if (tpl.kind === "stdio")
      return server.type === "stdio" && server.name === tpl.serverName;
    if (tpl.kind === "shttp")
      return server.type === "shttp" && server.url === tpl.url;
    if (tpl.kind === "sse")
      return server.type === "sse" && server.url === tpl.url;
    return false;
  });
}
