/**
 * Fetches a plugin marketplace catalog from a git repo (or direct URL) and returns the
 * UI-extension entries, resolved to bundle URLs ready for the install/consent flow.
 */

import { parseCatalog, resolveEntryInstallSource } from "./catalog";
import { marketplaceCatalogCandidates, parseMarketplaceSource } from "./source";

export interface UiExtensionListing {
  name: string;
  description?: string;
  version?: string;
  author?: string;
  homepage?: string;
  /**
   * The install source handed to the installer: a versioned source ref (`npm:…`/`gh:…`)
   * when the entry declares one, otherwise a resolved raw bundle URL.
   */
  installSource: string;
}

export interface MarketplaceResult {
  catalogName: string;
  listings: UiExtensionListing[];
}

type FetchLike = typeof fetch;

/**
 * Load a marketplace and return its installable UI extensions.
 * Tries `.plugin/marketplace.json` then `.claude-plugin/marketplace.json` for GitHub
 * sources. Throws if no catalog is found or the catalog is invalid.
 */
export async function fetchMarketplace(
  rawSource: string,
  fetchImpl: FetchLike = fetch,
): Promise<MarketplaceResult> {
  const source = parseMarketplaceSource(rawSource);
  const candidates = marketplaceCatalogCandidates(source);

  let catalogUrl: string | null = null;
  let raw: unknown = null;
  let lastError = "";
  for (const url of candidates) {
    try {
      const response = await fetchImpl(url);
      if (!response.ok) {
        lastError = `HTTP ${response.status} for ${url}`;
        continue;
      }
      raw = await response.json();
      catalogUrl = url;
      break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  if (catalogUrl === null) {
    throw new Error(
      `no marketplace catalog found (tried ${candidates.join(", ")})${
        lastError ? `: ${lastError}` : ""
      }`,
    );
  }

  const parsed = parseCatalog(raw);
  if (!parsed.ok) {
    throw new Error(`invalid marketplace catalog: ${parsed.errors.join("; ")}`);
  }

  const listings: UiExtensionListing[] = [];
  for (const entry of parsed.catalog.uiExtensions ?? []) {
    const installSource = resolveEntryInstallSource(source, catalogUrl, entry);
    if (!installSource) continue;
    listings.push({
      name: entry.name,
      description: entry.description,
      version: entry.version,
      author: entry.author?.name,
      homepage: entry.homepage,
      installSource,
    });
  }

  return { catalogName: parsed.catalog.name, listings };
}
