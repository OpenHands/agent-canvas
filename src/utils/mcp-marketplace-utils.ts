import { MCPServerConfig } from "#/types/mcp-server";
import type {
  IntegrationCatalogEntry as MarketplaceEntry,
  IntegrationTransport as MarketplaceTemplate,
} from "@openhands/extensions/integrations";

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
 *
 * Defensive against runtime data that doesn't match the static type:
 * if either input is not a string (e.g. parsed from an older settings
 * blob), we fall through the URL parsing path and the safe trim
 * fallback below, never calling `.replace` on undefined.
 */
export function urlsMatch(a: unknown, b: unknown): boolean {
  const aStr = typeof a === "string" ? a : "";
  const bStr = typeof b === "string" ? b : "";
  if (!aStr || !bStr) return false;
  const left = tryUrl(aStr);
  const right = tryUrl(bStr);
  if (!left || !right) {
    return aStr.replace(/\/+$/, "") === bStr.replace(/\/+$/, "");
  }
  return (
    left.protocol === right.protocol &&
    left.host === right.host &&
    left.pathname.replace(/\/+$/, "") === right.pathname.replace(/\/+$/, "")
  );
}

/**
 * Get the default transport template from an integration catalog entry.
 * Integrations may have multiple connection options; we use the default
 * one (or the first if no default is specified). Only MCP-backed options
 * have a `transport` field.
 */
export function getDefaultTemplate(
  entry: MarketplaceEntry,
): MarketplaceTemplate | undefined {
  const option =
    entry.connectionOptions.find(
      (o) => o.id === entry.defaultConnectionOptionId,
    ) ?? entry.connectionOptions[0];
  return option?.transport;
}

/**
 * Get the stdio (API key-based) transport template from an integration entry.
 * Many integrations have multiple connection options (e.g., OAuth + stdio).
 * Since OAuth isn't implemented in the UI yet, the install modal should use
 * this function to get the stdio-based option that can be configured with
 * API keys/tokens.
 *
 * Falls back to getDefaultTemplate if no stdio option exists.
 */
export function getInstallableTemplate(
  entry: MarketplaceEntry,
): MarketplaceTemplate | undefined {
  // First, try to find a stdio option (API key-based, what we can actually install)
  const stdioOption = entry.connectionOptions.find(
    (o) => o.transport?.kind === "stdio",
  );
  if (stdioOption?.transport) return stdioOption.transport;

  // Fall back to the default template (could be shttp/sse with api_key)
  return getDefaultTemplate(entry);
}

/**
 * Decide whether a marketplace template is already represented by one
 * of the installed MCP servers. Used to render an "Installed" badge on
 * the marketplace tile. Returns the first matching server, or null.
 */
export function findInstalledMatch(
  template: MarketplaceTemplate,
  servers: MCPServerConfig[],
): MCPServerConfig | null {
  if (template.kind === "shttp") {
    const tplUrl = template.url;
    if (!tplUrl) return null;
    return (
      servers.find(
        (s) => s.type === "shttp" && !!s.url && urlsMatch(s.url, tplUrl),
      ) ?? null
    );
  }

  if (template.kind === "sse") {
    const tplUrl = template.url;
    if (!tplUrl) return null;
    return (
      servers.find(
        (s) => s.type === "sse" && !!s.url && urlsMatch(s.url, tplUrl),
      ) ?? null
    );
  }

  // stdio: match on the registered server name.
  return (
    servers.find((s) => s.type === "stdio" && s.name === template.serverName) ??
    null
  );
}

export function isMarketplaceEntryAvailable(
  entry: MarketplaceEntry,
  backendKind: "local" | "cloud",
): boolean {
  if (!entry.runtimeAvailability || entry.runtimeAvailability === "all")
    return true;
  return entry.runtimeAvailability === backendKind;
}

function normalize(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Case-insensitive substring match against the catalog entry's
 * user-visible identity (name, description, id, keywords). Empty
 * queries always match.
 */
export function getMarketplaceEntriesByPopularity(
  catalog: MarketplaceEntry[],
): MarketplaceEntry[] {
  return catalog
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const byPopularity =
        (b.entry.popularityRank ?? 0) - (a.entry.popularityRank ?? 0);
      return byPopularity || a.index - b.index;
    })
    .map(({ entry }) => entry);
}

export function getMarketplaceEntryById(
  id: string,
  catalog: MarketplaceEntry[],
): MarketplaceEntry | undefined {
  return catalog.find((entry) => entry.id === id);
}

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
 *
 * Since an entry may have multiple connection options (e.g., OAuth + stdio),
 * we check ALL templates in the entry's connectionOptions, not just the default.
 */
export function findCatalogEntryForServer(
  server: MCPServerConfig,
  catalog: MarketplaceEntry[],
): MarketplaceEntry | undefined {
  return catalog.find((entry) => {
    // Check all connection options, not just the default
    for (const option of entry.connectionOptions) {
      const tpl = option.transport;
      if (!tpl) continue;
      if (tpl.kind === "stdio") {
        if (server.type === "stdio" && server.name === tpl.serverName)
          return true;
      }
      // Reuse the same loose URL match as `findInstalledMatch` so a
      // server whose URL was normalized by the backend (trailing slash
      // stripped, query string dropped, etc.) still gets paired with
      // its catalog tile — otherwise the installed-servers list would
      // render the generic icon while the marketplace shows the
      // entry as installed, which is confusing.
      if (tpl.kind === "shttp") {
        if (server.type === "shttp" && urlsMatch(server.url, tpl.url))
          return true;
      }
      if (tpl.kind === "sse") {
        if (server.type === "sse" && urlsMatch(server.url, tpl.url))
          return true;
      }
    }
    return false;
  });
}
