import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders } from "../../../../test-utils";
import { InstallExtensionForm } from "#/components/features/extensions/install-extension-form";
import * as ExtensionContext from "#/components/providers/extension-manager-provider";

vi.mock("#/components/providers/extension-manager-provider", async () => ({
  ...(await vi.importActual<
    typeof import("#/components/providers/extension-manager-provider")
  >("#/components/providers/extension-manager-provider")),
  useExtensionContext: vi.fn(),
}));

describe("InstallExtensionForm", () => {
  const mockPreviewManifest = vi.fn();
  const mockInstallFromUrl = vi.fn();
  const mockContext = {
    previewManifest: mockPreviewManifest,
    installFromUrl: mockInstallFromUrl,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ExtensionContext.useExtensionContext).mockReturnValue(
      mockContext as unknown as ReturnType<
        typeof ExtensionContext.useExtensionContext
      >,
    );
  });

  describe("when extensions are disabled", () => {
    it("shows disabled notice when context is null", () => {
      vi.mocked(ExtensionContext.useExtensionContext).mockReturnValue(null);

      renderWithProviders(<InstallExtensionForm />);

      expect(
        screen.getByTestId("install-extension-form-disabled"),
      ).toBeInTheDocument();
    });
  });

  describe("source validation feedback", () => {
    it("shows valid indicator for npm: sources", async () => {
      const user = userEvent.setup();

      renderWithProviders(<InstallExtensionForm />);

      const input = screen.getByTestId("extension-source-input");
      await user.type(input, "npm:@acme/hello");

      expect(screen.getByTestId("source-validation-valid")).toBeInTheDocument();
    });

    it("shows valid indicator for gh: sources", async () => {
      const user = userEvent.setup();

      renderWithProviders(<InstallExtensionForm />);

      const input = screen.getByTestId("extension-source-input");
      await user.type(input, "gh:acme/hello");

      expect(screen.getByTestId("source-validation-valid")).toBeInTheDocument();
    });

    it("shows valid indicator for https: sources", async () => {
      const user = userEvent.setup();

      renderWithProviders(<InstallExtensionForm />);

      const input = screen.getByTestId("extension-source-input");
      await user.type(input, "https://example.com/extension");

      expect(screen.getByTestId("source-validation-valid")).toBeInTheDocument();
    });

    it("shows invalid indicator for unrecognized sources", async () => {
      const user = userEvent.setup();

      renderWithProviders(<InstallExtensionForm />);

      const input = screen.getByTestId("extension-source-input");
      await user.type(input, "invalid-source");

      expect(
        screen.getByTestId("source-validation-invalid"),
      ).toBeInTheDocument();
    });

    it("disables review button when source is invalid", async () => {
      const user = userEvent.setup();

      renderWithProviders(<InstallExtensionForm />);

      const input = screen.getByTestId("extension-source-input");
      await user.type(input, "invalid-source");

      expect(screen.getByTestId("install-review-button")).toBeDisabled();
    });

    it("enables review button when source is valid", async () => {
      const user = userEvent.setup();

      renderWithProviders(<InstallExtensionForm />);

      const input = screen.getByTestId("extension-source-input");
      await user.type(input, "npm:hello");

      expect(screen.getByTestId("install-review-button")).toBeEnabled();
    });
  });

  describe("review flow", () => {
    it("shows manifest preview after clicking review", async () => {
      const user = userEvent.setup();
      mockPreviewManifest.mockResolvedValue({
        id: "test-extension",
        name: "Test Extension",
        version: "1.0.0",
        publisher: "Test Publisher",
        capabilities: ["conversation:read"],
      });

      renderWithProviders(<InstallExtensionForm />);

      const input = screen.getByTestId("extension-source-input");
      await user.type(input, "npm:test-extension");
      await user.click(screen.getByTestId("install-review-button"));

      await waitFor(() => {
        expect(screen.getByTestId("extension-review")).toBeInTheDocument();
      });

      expect(screen.getByText("Test Extension")).toBeInTheDocument();
    });

    it("shows error when preview fails", async () => {
      const user = userEvent.setup();
      mockPreviewManifest.mockRejectedValue(new Error("Network error"));

      renderWithProviders(<InstallExtensionForm />);

      const input = screen.getByTestId("extension-source-input");
      await user.type(input, "npm:test-extension");
      await user.click(screen.getByTestId("install-review-button"));

      await waitFor(() => {
        expect(screen.getByTestId("install-error")).toBeInTheDocument();
      });

      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  describe("install flow", () => {
    it("calls installFromUrl when confirming install", async () => {
      const user = userEvent.setup();
      mockPreviewManifest.mockResolvedValue({
        id: "test-extension",
        name: "Test Extension",
        version: "1.0.0",
        capabilities: [],
      });
      mockInstallFromUrl.mockResolvedValue({
        id: "test-extension",
        name: "Test Extension",
        version: "1.0.0",
        capabilities: [],
        sourceUrl: "https://example.com",
        origin: "user",
      });

      renderWithProviders(<InstallExtensionForm />);

      const input = screen.getByTestId("extension-source-input");
      await user.type(input, "npm:test-extension");
      await user.click(screen.getByTestId("install-review-button"));

      await waitFor(() => {
        expect(screen.getByTestId("extension-review")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("install-confirm-button"));

      await waitFor(() => {
        expect(mockInstallFromUrl).toHaveBeenCalledWith("npm:test-extension");
      });
    });

    it("calls onInstallComplete callback after successful install", async () => {
      const user = userEvent.setup();
      const onInstallComplete = vi.fn();
      mockPreviewManifest.mockResolvedValue({
        id: "test-extension",
        name: "Test Extension",
        version: "1.0.0",
        capabilities: [],
      });
      mockInstallFromUrl.mockResolvedValue({
        id: "test-extension",
        name: "Test Extension",
        version: "1.0.0",
        capabilities: [],
        sourceUrl: "https://example.com",
        origin: "user",
      });

      renderWithProviders(
        <InstallExtensionForm onInstallComplete={onInstallComplete} />,
      );

      const input = screen.getByTestId("extension-source-input");
      await user.type(input, "npm:test-extension");
      await user.click(screen.getByTestId("install-review-button"));

      await waitFor(() => {
        expect(screen.getByTestId("extension-review")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("install-confirm-button"));

      await waitFor(() => {
        expect(onInstallComplete).toHaveBeenCalled();
      });
    });

    it("allows going back from review", async () => {
      const user = userEvent.setup();
      mockPreviewManifest.mockResolvedValue({
        id: "test-extension",
        name: "Test Extension",
        version: "1.0.0",
        capabilities: [],
      });

      renderWithProviders(<InstallExtensionForm />);

      const input = screen.getByTestId("extension-source-input");
      await user.type(input, "npm:test-extension");
      await user.click(screen.getByTestId("install-review-button"));

      await waitFor(() => {
        expect(screen.getByTestId("extension-review")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("install-back-button"));

      await waitFor(() => {
        expect(
          screen.queryByTestId("extension-review"),
        ).not.toBeInTheDocument();
      });

      expect(screen.getByTestId("install-review-button")).toBeInTheDocument();
    });
  });
});
