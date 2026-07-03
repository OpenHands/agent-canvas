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
}

export default PluginsService;
