import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsPluginsScreen from "#/routes/skills-plugins";
import SettingsService from "#/api/settings-service/settings-service.api";
import PluginsService, { type MarketplacePlugin } from "#/api/plugins-service";
import PluginsManagementService, {
  type InstalledPluginInfo,
} from "#/api/plugins-management-service";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

const navigateMock = vi.fn();

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({
    navigate: navigateMock,
    currentPath: "/plugins",
    conversationId: null,
    isNavigating: false,
  }),
  NavigationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const localBackend: Backend = {
  id: "local",
  name: "Local",
  host: "http://127.0.0.1:8001",
  apiKey: "",
  kind: "local",
};

function buildCatalogPlugin(
  overrides: Partial<MarketplacePlugin> = {},
): MarketplacePlugin {
  return {
    name: "demo-plugin",
    description: "A demo plugin",
    source: "github:OpenHands/extensions",
    ref: null,
    repo_path: "plugins/demo-plugin",
    installed: false,
    ...overrides,
  };
}

function buildInstalledPlugin(
  overrides: Partial<InstalledPluginInfo> = {},
): InstalledPluginInfo {
  return {
    name: "demo-plugin",
    version: "1.0.0",
    description: "A demo plugin",
    enabled: true,
    source: "github:OpenHands/extensions",
    resolved_ref: null,
    repo_path: "plugins/demo-plugin",
    installed_at: "2026-06-01T00:00:00Z",
    install_path: "/home/.openhands/plugins/installed/demo-plugin",
    ...overrides,
  };
}

function renderPluginsScreen() {
  return render(<SkillsPluginsScreen />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    ),
  });
}

describe("SkillsPluginsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigateMock.mockReset();
    __resetActiveStoreForTests();
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      MOCK_DEFAULT_USER_SETTINGS,
    );
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([]);
    vi.spyOn(
      PluginsManagementService,
      "listInstalledPlugins",
    ).mockResolvedValue([]);
  });

  it("renders an Install action for a catalog plugin that is not installed", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      buildCatalogPlugin(),
    ]);

    renderPluginsScreen();

    expect(
      await screen.findByTestId("plugin-install-demo-plugin"),
    ).toBeInTheDocument();
  });

  it("renders an enable/disable toggle reflecting state for an installed plugin", async () => {
    vi.spyOn(
      PluginsManagementService,
      "listInstalledPlugins",
    ).mockResolvedValue([buildInstalledPlugin({ enabled: true })]);

    renderPluginsScreen();

    const toggle = await screen.findByTestId("plugin-toggle-demo-plugin");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("installs a catalog plugin with its coordinates when Install is clicked", async () => {
    const user = userEvent.setup();
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      buildCatalogPlugin(),
    ]);
    const installSpy = vi
      .spyOn(PluginsManagementService, "installPlugin")
      .mockResolvedValue(buildInstalledPlugin());

    renderPluginsScreen();
    await user.click(await screen.findByTestId("plugin-install-demo-plugin"));

    await waitFor(() =>
      expect(installSpy).toHaveBeenCalledWith({
        source: "github:OpenHands/extensions",
        ref: null,
        repo_path: "plugins/demo-plugin",
      }),
    );
  });

  it("toggles an installed plugin off via the card toggle", async () => {
    const user = userEvent.setup();
    vi.spyOn(
      PluginsManagementService,
      "listInstalledPlugins",
    ).mockResolvedValue([buildInstalledPlugin({ enabled: true })]);
    const toggleSpy = vi
      .spyOn(PluginsManagementService, "setPluginEnabled")
      .mockResolvedValue({ name: "demo-plugin", enabled: false });

    renderPluginsScreen();
    await user.click(await screen.findByTestId("plugin-toggle-demo-plugin"));

    await waitFor(() =>
      expect(toggleSpy).toHaveBeenCalledWith("demo-plugin", false),
    );
  });

  it("uninstalls an installed plugin from the detail modal", async () => {
    const user = userEvent.setup();
    vi.spyOn(
      PluginsManagementService,
      "listInstalledPlugins",
    ).mockResolvedValue([buildInstalledPlugin()]);
    const uninstallSpy = vi
      .spyOn(PluginsManagementService, "uninstallPlugin")
      .mockResolvedValue({ message: "ok" });

    renderPluginsScreen();
    await user.click(await screen.findByTestId("plugin-card-demo-plugin"));
    await user.click(
      await screen.findByTestId("plugin-detail-uninstall-demo-plugin"),
    );

    await waitFor(() =>
      expect(uninstallSpy).toHaveBeenCalledWith("demo-plugin"),
    );
  });

  it("filters the list by the search query", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      buildCatalogPlugin({ name: "alpha-plugin" }),
      buildCatalogPlugin({ name: "beta-plugin" }),
    ]);

    renderPluginsScreen();
    await screen.findByTestId("plugin-card-alpha-plugin");

    fireEvent.change(screen.getByTestId("plugins-search-input"), {
      target: { value: "beta" },
    });

    expect(
      screen.queryByTestId("plugin-card-alpha-plugin"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("plugin-card-beta-plugin")).toBeInTheDocument();
  });

  it("shows the empty state when there are no plugins", async () => {
    renderPluginsScreen();

    expect(await screen.findByTestId("plugins-empty")).toBeInTheDocument();
  });

  it("shows the no-match state when the search excludes everything", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      buildCatalogPlugin(),
    ]);

    renderPluginsScreen();
    await screen.findByTestId("plugin-card-demo-plugin");

    fireEvent.change(screen.getByTestId("plugins-search-input"), {
      target: { value: "no-such-plugin-xyz" },
    });

    expect(screen.getByTestId("plugins-no-match")).toBeInTheDocument();
  });
});
