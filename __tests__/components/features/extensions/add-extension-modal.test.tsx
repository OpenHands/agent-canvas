import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddExtensionModal } from "#/components/features/extensions/add-extension-modal";

const { previewMock, installMock, marketplaceMock } = vi.hoisted(() => ({
  previewMock: vi.fn(),
  installMock: vi.fn(),
  marketplaceMock: vi.fn(),
}));

vi.mock("#/components/providers/extension-manager-provider", () => ({
  useExtensionContext: () => ({
    manager: {},
    deps: {},
    previewManifest: previewMock,
    installFromUrl: installMock,
    fetchMarketplace: marketplaceMock,
    uninstall: vi.fn(),
  }),
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: vi.fn(),
  displayErrorToast: vi.fn(),
}));

describe("AddExtensionModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables review until a URL is entered", () => {
    render(<AddExtensionModal onClose={vi.fn()} />);
    expect(screen.getByTestId("add-extension-review")).toBeDisabled();
  });

  it("reviews permissions before installing", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    previewMock.mockResolvedValue({
      id: "acme.hello",
      name: "Hello",
      version: "1.0.0",
      capabilities: ["conversation:read"],
    });
    installMock.mockResolvedValue({ id: "acme.hello" });

    render(<AddExtensionModal onClose={onClose} />);

    await user.type(
      screen.getByTestId("add-extension-source-input"),
      "/__extensions/hello",
    );
    await user.click(screen.getByTestId("add-extension-review"));

    // Permissions are surfaced for consent; nothing installed yet.
    await waitFor(() =>
      expect(screen.getByTestId("extension-permissions")).toBeInTheDocument(),
    );
    expect(previewMock).toHaveBeenCalledWith("/__extensions/hello");
    expect(installMock).not.toHaveBeenCalled();

    // Granting installs and closes.
    await user.click(screen.getByTestId("add-extension-install"));
    await waitFor(() =>
      expect(installMock).toHaveBeenCalledWith("/__extensions/hello"),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("browses a marketplace and installs a listing with consent", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    marketplaceMock.mockResolvedValue({
      catalogName: "Examples",
      listings: [
        {
          name: "hello-sidebar",
          description: "Adds a Hello panel.",
          installSource: "https://raw.example/hello-sidebar",
        },
      ],
    });
    previewMock.mockResolvedValue({
      id: "acme.hello",
      name: "Hello",
      version: "1.0.0",
      capabilities: ["conversation:read"],
    });
    installMock.mockResolvedValue({ id: "acme.hello" });

    render(<AddExtensionModal onClose={onClose} />);

    await user.click(screen.getByTestId("add-extension-tab-marketplace"));
    await user.type(
      screen.getByTestId("add-extension-marketplace-input"),
      "github://acme/extensions",
    );
    await user.click(screen.getByTestId("add-extension-browse"));

    const listing = await screen.findByTestId(
      "marketplace-listing-hello-sidebar",
    );
    expect(marketplaceMock).toHaveBeenCalledWith("github://acme/extensions");

    // Selecting a listing surfaces its permissions; nothing installed yet.
    await user.click(listing);
    await waitFor(() =>
      expect(screen.getByTestId("extension-permissions")).toBeInTheDocument(),
    );
    expect(previewMock).toHaveBeenCalledWith(
      "https://raw.example/hello-sidebar",
    );
    expect(installMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("add-extension-install"));
    await waitFor(() =>
      expect(installMock).toHaveBeenCalledWith(
        "https://raw.example/hello-sidebar",
      ),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("surfaces a preview error without installing", async () => {
    const user = userEvent.setup();
    previewMock.mockRejectedValue(new Error("bad manifest: missing id"));

    render(<AddExtensionModal onClose={vi.fn()} />);
    await user.type(
      screen.getByTestId("add-extension-source-input"),
      "/__extensions/broken",
    );
    await user.click(screen.getByTestId("add-extension-review"));

    await waitFor(() =>
      expect(screen.getByTestId("add-extension-error")).toHaveTextContent(
        "bad manifest: missing id",
      ),
    );
    expect(installMock).not.toHaveBeenCalled();
  });
});
