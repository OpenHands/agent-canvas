import { PluginsClient } from "@openhands/typescript-client/clients";
import { getActiveBackend } from "./backend-registry/active-store";
import { getAgentServerClientOptions } from "./agent-server-client-options";

/**
 * A plugin in the dynamic marketplace catalog, with attachable coordinates and
 * install state. Matches the agent-server `MarketplacePluginInfo` / the
 * typescript-client `MarketplacePlugin`.
 */
export interface MarketplacePlugin {
  name: string;
  description: string | null;
  source: string;
  ref?: string | null;
  repo_path?: string | null;
  installed: boolean;
}

/**
 * A locally-discovered ("ambient") plugin reported by the agent-server — one
 * found in the user's local plugin directories (e.g. `~/.agents/plugins`).
 * These auto-load into conversations and are not managed via install/uninstall,
 * so the Plugins page renders them as a read-only "Local" group. Matches the
 * typescript-client `PluginInfo`.
 */
export interface LocalPlugin {
  name: string;
  version: string;
  description: string;
}

class PluginsService {
  /**
   * Fetch the dynamic plugins marketplace catalog.
   *
   * Local backend only for now: the catalog is fetched at run time from the
   * agent-server via the typed client (no bundled catalog, so the list stays
   * dynamic). On a cloud backend an empty catalog is returned — there is no
   * cloud plugins-marketplace endpoint yet (tracked as a follow-up ticket).
   */
  static async getPluginsMarketplace(): Promise<MarketplacePlugin[]> {
    if (getActiveBackend().backend.kind === "cloud") {
      return [];
    }

    try {
      const response = await new PluginsClient(
        getAgentServerClientOptions(),
      ).getPluginsMarketplace();
      return (response.plugins ?? []) as MarketplacePlugin[];
    } catch {
      // Agent-server may not support the plugins endpoint or be unreachable;
      // surface an empty catalog rather than throwing.
      return [];
    }
  }

  /**
   * Fetch the locally-discovered ("ambient") plugins from the agent-server.
   *
   * Only user-level plugins are requested (`~/.agents/plugins`,
   * `~/.openhands/plugins`, plus enabled installed plugins): the Plugins page is
   * global, so there is no project workspace to scope project plugins to.
   *
   * Local backend only — a cloud backend has no local plugin directories, so an
   * empty list is returned. Errors surface as an empty list (mirrors the
   * catalog) rather than throwing.
   */
  static async getLocalPlugins(): Promise<LocalPlugin[]> {
    if (getActiveBackend().backend.kind === "cloud") {
      return [];
    }

    try {
      const response = await new PluginsClient(
        getAgentServerClientOptions(),
      ).getPlugins({ load_user: true, load_project: false });
      return (response.plugins ?? []) as LocalPlugin[];
    } catch {
      return [];
    }
  }
}

export default PluginsService;
