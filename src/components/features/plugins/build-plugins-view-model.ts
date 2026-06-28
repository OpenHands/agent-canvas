import type { MarketplacePlugin } from "#/api/plugins-service";
import type { InstalledPluginInfo } from "#/api/plugins-management-service";

export type PluginStatusFilter = "all" | "installed" | "available";

/**
 * A single row in the plugins management list, reconciling the dynamic
 * marketplace catalog with the locally-installed plugins.
 */
export interface PluginViewModel {
  name: string;
  description: string | null;
  source: string | null;
  ref: string | null;
  repoPath: string | null;
  /** Installed on the local agent-server. */
  installed: boolean;
  /** Enabled (only meaningful when installed); enabled plugins auto-load. */
  enabled: boolean;
  /** Installed version, when known. */
  version: string | null;
  /** Present in the marketplace catalog. */
  inCatalog: boolean;
}

/**
 * Merge the marketplace catalog with the installed plugins into one
 * de-duplicated list keyed by plugin name. The installed list is the source of
 * truth for install/enable state and coordinates; the catalog supplies
 * description/coordinates as a fallback. Installed plugins sort first, then
 * alphabetically.
 */
export function buildPluginsViewModel(
  marketplace: MarketplacePlugin[] | undefined,
  installed: InstalledPluginInfo[] | undefined,
): PluginViewModel[] {
  const byName = new Map<string, PluginViewModel>();

  for (const entry of marketplace ?? []) {
    byName.set(entry.name, {
      name: entry.name,
      description: entry.description,
      source: entry.source,
      ref: entry.ref ?? null,
      repoPath: entry.repo_path ?? null,
      installed: entry.installed,
      enabled: false,
      version: null,
      inCatalog: true,
    });
  }

  for (const entry of installed ?? []) {
    const existing = byName.get(entry.name);
    byName.set(entry.name, {
      name: entry.name,
      description: existing?.description ?? entry.description ?? null,
      source: entry.source ?? existing?.source ?? null,
      ref: entry.resolved_ref ?? existing?.ref ?? null,
      repoPath: entry.repo_path ?? existing?.repoPath ?? null,
      installed: true,
      enabled: entry.enabled,
      version: entry.version ?? null,
      inCatalog: existing?.inCatalog ?? false,
    });
  }

  return Array.from(byName.values()).sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** True when the plugin matches a free-text search query (empty query matches). */
export function matchesPluginSearch(
  plugin: PluginViewModel,
  query: string,
): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  const haystacks = [
    plugin.name,
    plugin.description ?? "",
    plugin.source ?? "",
    plugin.repoPath ?? "",
    plugin.ref ?? "",
  ];
  return haystacks.some((value) => value.toLowerCase().includes(trimmed));
}

/** True when the plugin matches the install-state filter. */
export function matchesPluginStatus(
  plugin: PluginViewModel,
  filter: PluginStatusFilter,
): boolean {
  if (filter === "installed") return plugin.installed;
  if (filter === "available") return !plugin.installed;
  return true;
}
