import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { AcpCredentialsSection } from "#/components/features/settings/acp-credentials-section";
import { SecretsService } from "#/api/secrets-service";

// Observe the save outcome (success vs orphaned-credential warning) without
// rendering real toasts.
const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: toastMocks.success,
  displayWarningToast: toastMocks.warning,
  displayErrorToast: toastMocks.error,
}));

function renderSection(providerKey: string) {
  const user = userEvent.setup();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ActiveBackendProvider>
        <AcpCredentialsSection providerKey={providerKey} />
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
  return { user };
}

function useCloudBackend() {
  setRegisteredBackends([
    {
      id: "cloud-1",
      name: "Cloud",
      host: "https://app.example.dev",
      apiKey: "key",
      kind: "cloud",
    },
  ]);
  setActiveSelection({ backendId: "cloud-1", orgId: null });
}

beforeEach(() => {
  vi.restoreAllMocks();
  toastMocks.success.mockClear();
  toastMocks.warning.mockClear();
  toastMocks.error.mockClear();
  __resetActiveStoreForTests();
  vi.spyOn(SecretsService, "getSecrets").mockResolvedValue([]);
  vi.spyOn(SecretsService, "createSecret").mockResolvedValue();
});
afterEach(() => {
  __resetActiveStoreForTests();
});

describe("AcpCredentialsSection", () => {
  it("renders the provider's credential fields (blob as textarea, key as password)", () => {
    renderSection("codex");

    const blob = screen.getByTestId("settings-acp-secret-CODEX_AUTH_JSON");
    expect(blob.tagName).toBe("TEXTAREA");
    expect(
      screen.getByTestId("settings-acp-secret-OPENAI_API_KEY"),
    ).toHaveAttribute("type", "password");
    // Pristine form — nothing to save yet.
    expect(screen.getByTestId("acp-credentials-save-button")).toBeDisabled();
  });

  it("renders nothing for a provider without credential fields", () => {
    renderSection("custom");
    expect(
      screen.queryByTestId("acp-credentials-save-button"),
    ).not.toBeInTheDocument();
  });

  it("saves the filled fields as secrets and resets the form", async () => {
    const { user } = renderSection("claude-code");

    await user.type(
      screen.getByTestId("settings-acp-secret-ANTHROPIC_API_KEY"),
      "sk-ant-123",
    );
    await user.click(screen.getByTestId("acp-credentials-save-button"));

    await waitFor(() => {
      expect(SecretsService.createSecret).toHaveBeenCalledWith(
        "ANTHROPIC_API_KEY",
        "sk-ant-123",
        undefined,
      );
      expect(toastMocks.success).toHaveBeenCalledTimes(1);
    });
    expect(
      (
        screen.getByTestId(
          "settings-acp-secret-ANTHROPIC_API_KEY",
        ) as HTMLInputElement
      ).value,
    ).toBe("");
  });

  it("warns when the Claude OAuth token and base URL are both set", async () => {
    const { user } = renderSection("claude-code");

    await user.type(
      screen.getByTestId("settings-acp-secret-CLAUDE_CODE_OAUTH_TOKEN"),
      "oauth-token",
    );
    expect(
      screen.queryByTestId("acp-credential-conflict-warning"),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByTestId("settings-acp-secret-ANTHROPIC_BASE_URL"),
      "https://proxy.example.com",
    );
    expect(
      screen.getByTestId("acp-credential-conflict-warning"),
    ).toBeInTheDocument();
  });

  it("toasts success when a file credential is saved on a cloud backend (now materialised)", async () => {
    // Cloud now materialises file-content credentials from the encrypted secret
    // store via agent_context.secrets at conversation start (#1016/#1126), so a
    // saved blob is consumable — no orphaned-credential warning.
    useCloudBackend();
    const { user } = renderSection("codex");

    await user.click(screen.getByTestId("settings-acp-secret-CODEX_AUTH_JSON"));
    await user.paste('{"tokens":{}}');
    await user.click(screen.getByTestId("acp-credentials-save-button"));

    await waitFor(() => {
      expect(SecretsService.createSecret).toHaveBeenCalledWith(
        "CODEX_AUTH_JSON",
        '{"tokens":{}}',
        undefined,
      );
      expect(toastMocks.success).toHaveBeenCalled();
    });
    expect(toastMocks.warning).not.toHaveBeenCalled();
  });
});
