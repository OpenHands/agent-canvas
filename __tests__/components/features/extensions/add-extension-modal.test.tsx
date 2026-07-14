import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddExtensionModal } from "#/components/features/extensions/add-extension-modal";

const { detectMock, previewMock, installMock, marketplaceMock } = vi.hoisted(
  () => ({
    detectMock: vi.fn(),
    previewMock: vi.fn(),
    installMock: vi.fn(),
    marketplaceMock: vi.fn(),
  }),
);

vi.mock("#/components/providers/extension-manager-provider", () => ({
  useExtensionContext: () => ({
    manager: {},
    deps: {},
    detectSource: detectMock,
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

const HELLO_PREVIEW = {
  id: "acme.hello",
  name: "Hello",
  version: "1.0.0",
  capabilities: ["conversation:read" as const],
};

describe("AddExtensionModal (auto-detect)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables submit until a valid source is entered", async () => {
    const user = userEvent.setup();
    render(<AddExtensionModal onClose={vi.fn()} />);

    expect(screen.getByTestId("add-extension-submit")).toBeDisabled();

    // An unparseable source keeps submit disabled and shows the invalid badge.
    await user.type(
      screen.getByTestId("add-extension-source-input"),
      "not a source",
    );
    expect(screen.getByTestId("source-validation-invalid")).toBeInTheDocument();
    expect(screen.getByTestId("add-extension-submit")).toBeDisabled();
  });

  it("shows a valid type badge for a github: source", async () => {
    const user = userEvent.setup();
    render(<AddExtensionModal onClose={vi.fn()} />);

    await user.type(
      screen.getByTestId("add-extension-source-input"),
      "github:acme/hello",
    );
    expect(screen.getByTestId("source-validation-valid")).toBeInTheDocument();
    expect(screen.getByTestId("add-extension-submit")).toBeEnabled();
  });

  it("routes a detected manifest straight to the consent card, then installs", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    detectMock.mockResolvedValue({
      kind: "manifest",
      installSource: "npm:@acme/hello@^1",
      preview: HELLO_PREVIEW,
    });
    installMock.mockResolvedValue({ id: "acme.hello" });

    render(<AddExtensionModal onClose={onClose} />);
    await user.type(
      screen.getByTestId("add-extension-source-input"),
      "npm:@acme/hello@^1",
    );
    await user.click(screen.getByTestId("add-extension-submit"));

    // Consent card is shown; nothing installed yet.
    await waitFor(() =>
      expect(screen.getByTestId("extension-permissions")).toBeInTheDocument(),
    );
    expect(detectMock).toHaveBeenCalledWith("npm:@acme/hello@^1");
    expect(installMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("add-extension-install"));
    await waitFor(() =>
      expect(installMock).toHaveBeenCalledWith("npm:@acme/hello@^1"),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the listing picker for a detected catalog and installs a listing with consent", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    detectMock.mockResolvedValue({
      kind: "catalog",
      installSource: "github:acme/extensions",
      result: {
        catalogName: "Examples",
        listings: [
          {
            name: "hello-sidebar",
            description: "Adds a Hello panel.",
            installSource: "npm:@acme/hello-sidebar@^1",
          },
          {
            name: "second",
            installSource: "npm:@acme/second@^1",
          },
        ],
      },
    });
    previewMock.mockResolvedValue(HELLO_PREVIEW);
    installMock.mockResolvedValue({ id: "acme.hello" });

    render(<AddExtensionModal onClose={onClose} />);
    await user.type(
      screen.getByTestId("add-extension-source-input"),
      "github:acme/extensions",
    );
    await user.click(screen.getByTestId("add-extension-submit"));

    const listing = await screen.findByTestId(
      "marketplace-listing-hello-sidebar",
    );
    // The catalog orientation is preserved in the result header.
    expect(screen.getByTestId("marketplace-header")).toBeInTheDocument();
    expect(
      screen.getByTestId("marketplace-listing-source-hello-sidebar"),
    ).toHaveTextContent("npm:@acme/hello-sidebar@^1");

    // Selecting a listing surfaces its permissions; nothing installed yet.
    await user.click(listing);
    await waitFor(() =>
      expect(screen.getByTestId("extension-permissions")).toBeInTheDocument(),
    );
    expect(previewMock).toHaveBeenCalledWith("npm:@acme/hello-sidebar@^1");
    expect(installMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("add-extension-install"));
    await waitFor(() =>
      expect(installMock).toHaveBeenCalledWith("npm:@acme/hello-sidebar@^1"),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("surfaces a clear error when detection finds nothing", async () => {
    const user = userEvent.setup();
    detectMock.mockResolvedValue({ kind: "none" });

    render(<AddExtensionModal onClose={vi.fn()} />);
    await user.type(
      screen.getByTestId("add-extension-source-input"),
      "https://example.com/nothing",
    );
    await user.click(screen.getByTestId("add-extension-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("add-extension-error")).toBeInTheDocument(),
    );
    expect(installMock).not.toHaveBeenCalled();
  });

  it("does not install when detection rejects", async () => {
    const user = userEvent.setup();
    detectMock.mockRejectedValue(new Error("network down"));

    render(<AddExtensionModal onClose={vi.fn()} />);
    await user.type(
      screen.getByTestId("add-extension-source-input"),
      "npm:@acme/hello",
    );
    await user.click(screen.getByTestId("add-extension-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("add-extension-error")).toHaveTextContent(
        "network down",
      ),
    );
    expect(installMock).not.toHaveBeenCalled();
  });
});
