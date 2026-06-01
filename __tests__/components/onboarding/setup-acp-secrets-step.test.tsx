import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { SetupAcpSecretsStep } from "#/components/features/onboarding/steps/setup-acp-secrets-step";
import { SecretsService } from "#/api/secrets-service";

function renderStep(providerKey = "claude-code") {
  const onBack = vi.fn();
  const onNext = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ActiveBackendProvider>
        <SetupAcpSecretsStep
          providerKey={providerKey}
          onBack={onBack}
          onNext={onNext}
        />
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
  return { onBack, onNext };
}

beforeEach(() => {
  vi.restoreAllMocks();
  __resetActiveStoreForTests();
  vi.spyOn(SecretsService, "getSecrets").mockResolvedValue([]);
  vi.spyOn(SecretsService, "createSecret").mockResolvedValue();
});
afterEach(() => {
  __resetActiveStoreForTests();
});

describe("SetupAcpSecretsStep", () => {
  it("renders the provider's API key and optional base URL fields", () => {
    renderStep("codex");

    expect(
      screen.getByTestId("onboarding-acp-secret-OPENAI_API_KEY"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("onboarding-acp-secret-OPENAI_BASE_URL"),
    ).toBeInTheDocument();
    // The API key is a password field; the base URL is a plain text input.
    expect(
      screen.getByTestId("onboarding-acp-secret-OPENAI_API_KEY"),
    ).toHaveAttribute("type", "password");
    expect(
      screen.getByTestId("onboarding-acp-secret-OPENAI_BASE_URL"),
    ).toHaveAttribute("type", "text");
  });

  it("flags a credential that already exists as a saved secret", async () => {
    vi.spyOn(SecretsService, "getSecrets").mockResolvedValue([
      { name: "ANTHROPIC_API_KEY" },
    ]);
    renderStep("claude-code");

    // The already-saved field carries a non-empty placeholder hint; a
    // not-yet-saved field (base URL) does not.
    const apiKey = screen.getByTestId(
      "onboarding-acp-secret-ANTHROPIC_API_KEY",
    ) as HTMLInputElement;
    const baseUrl = screen.getByTestId(
      "onboarding-acp-secret-ANTHROPIC_BASE_URL",
    ) as HTMLInputElement;
    await waitFor(() => expect(apiKey.placeholder.length).toBeGreaterThan(0));
    expect(baseUrl.placeholder).toBe("");
  });

  it("upserts every filled field as a secret and then advances", async () => {
    const { onNext } = renderStep("claude-code");
    const user = userEvent.setup();

    await user.type(
      screen.getByTestId("onboarding-acp-secret-ANTHROPIC_API_KEY"),
      "sk-ant-123",
    );
    await user.type(
      screen.getByTestId("onboarding-acp-secret-ANTHROPIC_BASE_URL"),
      "https://proxy.example.com",
    );
    await user.click(screen.getByTestId("onboarding-acp-secrets-next"));

    await waitFor(() => {
      expect(SecretsService.createSecret).toHaveBeenCalledWith(
        "ANTHROPIC_API_KEY",
        "sk-ant-123",
        undefined,
      );
      expect(SecretsService.createSecret).toHaveBeenCalledWith(
        "ANTHROPIC_BASE_URL",
        "https://proxy.example.com",
        undefined,
      );
      expect(onNext).toHaveBeenCalledTimes(1);
    });
  });

  it("does not advance when a secret write fails", async () => {
    vi.spyOn(SecretsService, "createSecret").mockRejectedValue(
      new Error("boom"),
    );
    const { onNext } = renderStep("claude-code");
    const user = userEvent.setup();

    await user.type(
      screen.getByTestId("onboarding-acp-secret-ANTHROPIC_API_KEY"),
      "sk-ant-123",
    );
    await user.click(screen.getByTestId("onboarding-acp-secrets-next"));

    await waitFor(() =>
      expect(SecretsService.createSecret).toHaveBeenCalledTimes(1),
    );
    expect(onNext).not.toHaveBeenCalled();
  });
});
