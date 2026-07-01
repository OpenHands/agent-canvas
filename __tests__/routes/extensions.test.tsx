import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExtensionsScreen from "#/routes/extensions";
import { useInstalledExtensionsStore } from "#/extensions/installed-store";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";

const ctx = vi.hoisted(() => ({
  value: null as null | Record<string, unknown>,
}));

vi.mock("#/components/providers/extension-manager-provider", () => ({
  useExtensionContext: () => ctx.value,
}));

vi.mock("#/components/features/skills/extensions-navigation", () => ({
  ExtensionsNavigation: () => <nav data-testid="extensions-nav" />,
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: vi.fn(),
  displayErrorToast: vi.fn(),
}));

function makeContext() {
  return {
    manager: {},
    deps: {},
    previewManifest: vi.fn(),
    installFromUrl: vi.fn(),
    checkForUpdate: vi.fn().mockResolvedValue(null),
    updateExtension: vi.fn(),
    uninstall: vi.fn(),
    fetchMarketplace: vi.fn(),
  };
}

function addHello() {
  useInstalledExtensionsStore.getState().add({
    id: "acme.hello",
    name: "Hello",
    version: "1.0.0",
    capabilities: ["conversation:read"],
    sourceUrl: "https://cdn.jsdelivr.net/npm/acme-hello@1.0.0",
    sourceRef: "npm:acme-hello@^1",
    origin: "user",
  });
}

describe("ExtensionsScreen", () => {
  beforeEach(() => {
    ctx.value = null;
    localStorage.clear();
    useInstalledExtensionsStore.getState().clear();
  });
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useInstalledExtensionsStore.getState().clear();
  });

  it("shows a disabled notice and no add button when the feature is off", () => {
    ctx.value = null;
    render(<ExtensionsScreen />);
    expect(screen.getByTestId("extensions-disabled")).toBeInTheDocument();
    expect(
      screen.queryByTestId("extensions-add-button"),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when enabled with nothing installed", () => {
    ctx.value = makeContext();
    render(<ExtensionsScreen />);
    expect(screen.getByTestId("extension-list-empty")).toBeInTheDocument();
    expect(screen.getByTestId("extensions-add-button")).toBeInTheDocument();
  });

  it("lists installed extensions and opens the add modal", async () => {
    const user = userEvent.setup();
    ctx.value = makeContext();
    useInstalledExtensionsStore.getState().add({
      id: "acme.hello",
      name: "Hello",
      version: "1.0.0",
      capabilities: ["conversation:read"],
      sourceUrl: "/__extensions/hello",
      origin: "user",
    });

    render(<ExtensionsScreen />);
    expect(
      screen.getByTestId("extension-card-acme.hello"),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("extensions-add-button"));
    expect(screen.getByTestId("add-extension-modal")).toBeInTheDocument();
  });

  it("surfaces an available update and applies it on click", async () => {
    const user = userEvent.setup();
    const context = makeContext();
    context.checkForUpdate.mockResolvedValue({
      id: "acme.hello",
      currentVersion: "1.0.0",
      latestVersion: "1.5.0",
      sourceRef: "npm:acme-hello@^1",
    });
    context.updateExtension.mockResolvedValue(undefined);
    ctx.value = context;
    addHello();

    render(<ExtensionsScreen />);

    const updateButton = await screen.findByTestId(
      "extension-update-acme.hello",
    );
    expect(
      screen.getByTestId("extension-update-badge-acme.hello"),
    ).toBeInTheDocument();

    await user.click(updateButton);
    expect(context.updateExtension).toHaveBeenCalledWith("acme.hello");
    await waitFor(() => expect(displaySuccessToast).toHaveBeenCalled());
  });

  it("does not show an update affordance when none is available", async () => {
    ctx.value = makeContext();
    addHello();

    render(<ExtensionsScreen />);
    expect(
      await screen.findByTestId("extension-card-acme.hello"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(ctx.value!.checkForUpdate).toHaveBeenCalledWith("acme.hello"),
    );
    expect(
      screen.queryByTestId("extension-update-acme.hello"),
    ).not.toBeInTheDocument();
  });
});
