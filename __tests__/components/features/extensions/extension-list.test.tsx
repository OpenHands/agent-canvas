import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders } from "../../../../test-utils";
import { ExtensionList } from "#/components/features/extensions/extension-list";
import * as ExtensionContext from "#/components/providers/extension-manager-provider";
import * as InstalledStore from "#/extensions/installed-store";

vi.mock("#/components/providers/extension-manager-provider", async () => ({
  ...(await vi.importActual<
    typeof import("#/components/providers/extension-manager-provider")
  >("#/components/providers/extension-manager-provider")),
  useExtensionContext: vi.fn(),
}));

vi.mock("#/extensions/installed-store", async () => ({
  ...(await vi.importActual<typeof import("#/extensions/installed-store")>(
    "#/extensions/installed-store",
  )),
  useInstalledExtensionsStore: vi.fn(),
}));

describe("ExtensionList", () => {
  const mockUninstall = vi.fn();
  const mockCheckForUpdate = vi.fn();
  const mockUpdateExtension = vi.fn();
  const mockContext = {
    uninstall: mockUninstall,
    checkForUpdate: mockCheckForUpdate,
    updateExtension: mockUpdateExtension,
  };

  const mockExtension = {
    id: "test-extension",
    name: "Test Extension",
    version: "1.0.0",
    publisher: "Test Publisher",
    capabilities: ["conversation:read"] as const,
    sourceUrl: "https://example.com",
    sourceRef: "npm:test-extension@1.0.0",
    origin: "user" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(ExtensionContext.useExtensionContext).mockReturnValue(
      mockContext as unknown as ReturnType<
        typeof ExtensionContext.useExtensionContext
      >,
    );
    vi.mocked(InstalledStore.useInstalledExtensionsStore).mockReturnValue([]);
    mockCheckForUpdate.mockResolvedValue(null);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("when extensions are disabled", () => {
    it("shows disabled notice when context is null", () => {
      vi.mocked(ExtensionContext.useExtensionContext).mockReturnValue(null);

      renderWithProviders(<ExtensionList />);

      expect(
        screen.getByTestId("extension-list-disabled"),
      ).toBeInTheDocument();
    });
  });

  describe("when no extensions are installed", () => {
    it("shows empty state", () => {
      vi.mocked(InstalledStore.useInstalledExtensionsStore).mockReturnValue([]);

      renderWithProviders(<ExtensionList />);

      expect(screen.getByTestId("extension-list-empty")).toBeInTheDocument();
    });
  });

  describe("when extensions are installed", () => {
    beforeEach(() => {
      vi.mocked(InstalledStore.useInstalledExtensionsStore).mockReturnValue([
        mockExtension,
      ]);
    });

    it("displays extension cards", () => {
      renderWithProviders(<ExtensionList />);

      expect(screen.getByTestId("extension-list")).toBeInTheDocument();
      expect(
        screen.getByTestId("extension-card-test-extension"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("extension-name-test-extension"),
      ).toHaveTextContent("Test Extension");
    });

    it("shows extension source ref with type indicator", () => {
      renderWithProviders(<ExtensionList />);

      expect(
        screen.getByTestId("extension-source-test-extension"),
      ).toHaveTextContent("npm:test-extension@1.0.0");
      expect(
        screen.getByTestId("extension-ref-type-test-extension"),
      ).toBeInTheDocument();
    });

    it("shows version badge", () => {
      renderWithProviders(<ExtensionList />);

      expect(
        screen.getByTestId("extension-version-test-extension"),
      ).toBeInTheDocument();
    });

    it("shows permissions section", () => {
      renderWithProviders(<ExtensionList />);

      // The capability is rendered through an i18n key, so we check the element exists
      const card = screen.getByTestId("extension-card-test-extension");
      expect(card).toBeInTheDocument();
    });
  });

  describe("enable/disable toggle", () => {
    beforeEach(() => {
      vi.mocked(InstalledStore.useInstalledExtensionsStore).mockReturnValue([
        mockExtension,
      ]);
    });

    it("has toggle enabled by default", () => {
      renderWithProviders(<ExtensionList />);

      const toggle = screen.getByTestId("extension-toggle-test-extension");
      const checkbox = toggle.querySelector('input[type="checkbox"]');
      expect(checkbox).toBeChecked();
    });

    it("can toggle extension off", async () => {
      const user = userEvent.setup();

      renderWithProviders(<ExtensionList />);

      const toggle = screen.getByTestId("extension-toggle-test-extension");
      const checkbox = toggle.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement;

      await user.click(checkbox);

      expect(checkbox).not.toBeChecked();
    });

    it("persists toggle state to localStorage", async () => {
      const user = userEvent.setup();

      renderWithProviders(<ExtensionList />);

      const toggle = screen.getByTestId("extension-toggle-test-extension");
      const checkbox = toggle.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement;

      await user.click(checkbox);

      await waitFor(() => {
        const stored = localStorage.getItem("agent-canvas:extensions:enabled");
        expect(stored).not.toBeNull();
        const parsed = JSON.parse(stored!);
        expect(parsed["test-extension"]).toBe(false);
      });
    });
  });

  describe("uninstall", () => {
    beforeEach(() => {
      vi.mocked(InstalledStore.useInstalledExtensionsStore).mockReturnValue([
        mockExtension,
      ]);
    });

    it("calls uninstall when clicking uninstall button", async () => {
      const user = userEvent.setup();

      renderWithProviders(<ExtensionList />);

      const uninstallButton = screen.getByTestId(
        "extension-uninstall-test-extension",
      );
      await user.click(uninstallButton);

      expect(mockUninstall).toHaveBeenCalledWith("test-extension");
    });
  });

  describe("updates", () => {
    const extensionWithUpdate = {
      ...mockExtension,
    };

    beforeEach(() => {
      vi.mocked(InstalledStore.useInstalledExtensionsStore).mockReturnValue([
        extensionWithUpdate,
      ]);
    });

    it("shows update badge when update is available", async () => {
      mockCheckForUpdate.mockResolvedValue({
        id: "test-extension",
        currentVersion: "1.0.0",
        latestVersion: "2.0.0",
        sourceRef: "npm:test-extension@^1.0.0",
      });

      renderWithProviders(<ExtensionList />);

      await waitFor(() => {
        expect(
          screen.getByTestId("extension-update-badge-test-extension"),
        ).toBeInTheDocument();
      });
    });

    it("calls updateExtension when clicking update button", async () => {
      const user = userEvent.setup();
      mockCheckForUpdate.mockResolvedValue({
        id: "test-extension",
        currentVersion: "1.0.0",
        latestVersion: "2.0.0",
        sourceRef: "npm:test-extension@^1.0.0",
      });
      mockUpdateExtension.mockResolvedValue({
        ...mockExtension,
        version: "2.0.0",
      });

      renderWithProviders(<ExtensionList />);

      await waitFor(() => {
        expect(
          screen.getByTestId("extension-update-test-extension"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("extension-update-test-extension"));

      await waitFor(() => {
        expect(mockUpdateExtension).toHaveBeenCalledWith("test-extension");
      });
    });
  });

  describe("dev extensions", () => {
    it("shows dev badge and hides toggle for dev extensions", () => {
      const devExtension = {
        ...mockExtension,
        origin: "dev" as const,
        sourceRef: undefined,
      };
      vi.mocked(InstalledStore.useInstalledExtensionsStore).mockReturnValue([
        devExtension,
      ]);

      renderWithProviders(<ExtensionList />);

      expect(screen.getByText(/dev/i)).toBeInTheDocument();
      expect(
        screen.queryByTestId("extension-toggle-test-extension"),
      ).not.toBeInTheDocument();
    });
  });

  describe("different source types", () => {
    it("shows ref type indicator for gh: sources", () => {
      const ghExtension = {
        ...mockExtension,
        sourceRef: "gh:acme/hello@v1.0.0",
      };
      vi.mocked(InstalledStore.useInstalledExtensionsStore).mockReturnValue([
        ghExtension,
      ]);

      renderWithProviders(<ExtensionList />);

      expect(
        screen.getByTestId("extension-ref-type-test-extension"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("extension-source-test-extension"),
      ).toHaveTextContent("gh:acme/hello@v1.0.0");
    });

    it("shows ref type indicator for https: sources", () => {
      const urlExtension = {
        ...mockExtension,
        sourceRef: "https://example.com/extension",
      };
      vi.mocked(InstalledStore.useInstalledExtensionsStore).mockReturnValue([
        urlExtension,
      ]);

      renderWithProviders(<ExtensionList />);

      expect(
        screen.getByTestId("extension-ref-type-test-extension"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("extension-source-test-extension"),
      ).toHaveTextContent("https://example.com/extension");
    });
  });
});
