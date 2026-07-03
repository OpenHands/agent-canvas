import { describe, expect, it } from "vitest";
import { buildPluginsViewModel } from "#/components/features/plugins/build-plugins-view-model";
import type { MarketplacePlugin } from "#/api/plugins-service";
import type { InstalledPluginInfo } from "#/api/plugins-management-service";

const catalogPlugin: MarketplacePlugin = {
  name: "demo-plugin",
  description: "Catalog description",
  source: "github:OpenHands/extensions",
  ref: null,
  repo_path: "plugins/demo-plugin",
  installed: false,
};

const installedPlugin: InstalledPluginInfo = {
  name: "demo-plugin",
  version: "2.0.0",
  description: "Installed description",
  enabled: false,
  source: "github:OpenHands/extensions",
  resolved_ref: "main",
  repo_path: "plugins/demo-plugin",
  installed_at: "2026-06-01T00:00:00Z",
  install_path: "/home/.openhands/plugins/installed/demo-plugin",
};

describe("buildPluginsViewModel", () => {
  it("merges a plugin present in both the catalog and the installed list into one installed entry", () => {
    const result = buildPluginsViewModel([catalogPlugin], [installedPlugin]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "demo-plugin",
      installed: true,
      inCatalog: true,
      enabled: false,
      version: "2.0.0",
    });
  });

  it("marks a catalog-only plugin as not installed", () => {
    const result = buildPluginsViewModel([catalogPlugin], []);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "demo-plugin",
      installed: false,
      inCatalog: true,
    });
  });

  it("keeps an installed plugin that is absent from the catalog", () => {
    const result = buildPluginsViewModel([], [installedPlugin]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "demo-plugin",
      installed: true,
      inCatalog: false,
      enabled: false,
    });
  });
});
