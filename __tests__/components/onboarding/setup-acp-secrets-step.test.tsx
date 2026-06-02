import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { SetupAcpSecretsStep } from "#/components/features/onboarding/steps/setup-acp-secrets-step";
import { type OnboardingAgentId } from "#/components/features/onboarding/steps/choose-agent-step";
import { SecretsService } from "#/api/secrets-service";

// The login-detection probe is exercised in its own hook test; here we stub it
// so rendering the step doesn't spin a conversation, and so we can drive the
// banner states directly.
const acpAuthStatusMock = vi.hoisted(() => vi.fn());
vi.mock("#/hooks/query/use-acp-auth-status", () => ({
  useAcpAuthStatus: (...args: unknown[]) => acpAuthStatusMock(...args),
}));

function renderStep(
  providerKey: OnboardingAgentId = "claude-code",
  isActive = true,
) {
  const onBack = vi.fn();
  const onNext = vi.fn();
  const user = userEvent.setup();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ActiveBackendProvider>
        <SetupAcpSecretsStep
          providerKey={providerKey}
          isActive={isActive}
          onBack={onBack}
          onNext={onNext}
        />
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
  return { onBack, onNext, user };
}

/**
 * Render the Claude Code step with ANTHROPIC_API_KEY already saved, and wait
 * until that state has loaded (its "already saved" placeholder appears once
 * `useSearchSecrets` resolves). Shared by every test that exercises the
 * existing-secret paths so the fixture lives in one place.
 */
async function renderWithSavedApiKey() {
  vi.spyOn(SecretsService, "getSecrets").mockResolvedValue([
    { name: "ANTHROPIC_API_KEY" },
  ]);
  const handles = renderStep("claude-code");
  const apiKey = screen.getByTestId(
    "onboarding-acp-secret-ANTHROPIC_API_KEY",
  ) as HTMLInputElement;
  await waitFor(() => expect(apiKey.placeholder.length).toBeGreaterThan(0));
  return { ...handles, apiKey };
}

beforeEach(() => {
  vi.restoreAllMocks();
  __resetActiveStoreForTests();
  acpAuthStatusMock.mockReturnValue({
    status: "unknown",
    isChecking: false,
    isSupported: false,
  });
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
    const { apiKey } = await renderWithSavedApiKey();

    // The already-saved field carries a non-empty placeholder hint; a
    // not-yet-saved field (base URL) does not.
    const baseUrl = screen.getByTestId(
      "onboarding-acp-secret-ANTHROPIC_BASE_URL",
    ) as HTMLInputElement;
    expect(apiKey.placeholder.length).toBeGreaterThan(0);
    expect(baseUrl.placeholder).toBe("");
  });

  it("does not write an existing secret when its field is left blank", async () => {
    const { onNext, user } = await renderWithSavedApiKey();

    // Advance without typing: a blank field is a deliberate skip, so the
    // already-saved secret must be left untouched (no overwrite).
    await user.click(screen.getByTestId("onboarding-acp-secrets-next"));

    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(SecretsService.createSecret).not.toHaveBeenCalled();
  });

  it("overwrites an existing secret when the user types a replacement", async () => {
    // Key rotation: a credential is already saved, the user types a new value
    // over it. The blank-skip guard must not suppress this — the new value has
    // to be written even though the secret already exists.
    const { onNext, user, apiKey } = await renderWithSavedApiKey();

    await user.type(apiKey, "sk-ant-new-key");
    await user.click(screen.getByTestId("onboarding-acp-secrets-next"));

    await waitFor(() => {
      expect(SecretsService.createSecret).toHaveBeenCalledWith(
        "ANTHROPIC_API_KEY",
        "sk-ant-new-key",
        undefined,
      );
      expect(onNext).toHaveBeenCalledTimes(1);
    });
  });

  it("upserts every filled field as a secret and then advances", async () => {
    const { onNext, user } = renderStep("claude-code");

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
    const { onNext, user } = renderStep("claude-code");

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

  it("runs the login probe scoped to the active step and provider", () => {
    renderStep("claude-code", true);
    expect(acpAuthStatusMock).toHaveBeenCalledWith("claude-code", {
      enabled: true,
    });
  });

  it("disables the login probe when the step is not active", () => {
    renderStep("claude-code", false);
    expect(acpAuthStatusMock).toHaveBeenCalledWith("claude-code", {
      enabled: false,
    });
  });

  it("shows the 'checking' banner while the login probe is in flight", () => {
    acpAuthStatusMock.mockReturnValue({
      status: "unknown",
      isChecking: true,
      isSupported: true,
    });
    renderStep("claude-code");

    expect(
      screen.getByTestId("onboarding-acp-auth-checking"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("onboarding-acp-auth-detected"),
    ).not.toBeInTheDocument();
  });

  it("shows the 'already signed in' banner when authenticated, keeping the key fields", () => {
    acpAuthStatusMock.mockReturnValue({
      status: "authenticated",
      isChecking: false,
      isSupported: true,
    });
    renderStep("claude-code");

    expect(
      screen.getByTestId("onboarding-acp-auth-detected"),
    ).toBeInTheDocument();
    // The fields stay visible (now optional) even when already logged in.
    expect(
      screen.getByTestId("onboarding-acp-secret-ANTHROPIC_API_KEY"),
    ).toBeInTheDocument();
  });

  it("renders Gemini's credential fields and the 'signed in' banner together", () => {
    // Gemini's key/base-URL come from the SDK registry like the others, so the
    // step shows the GEMINI_API_KEY field AND the detection banner (its Google
    // login takes precedence, but a key can still be entered).
    acpAuthStatusMock.mockReturnValue({
      status: "authenticated",
      isChecking: false,
      isSupported: true,
    });
    renderStep("gemini-cli");

    expect(
      screen.getByTestId("onboarding-acp-auth-detected"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("onboarding-acp-secret-GEMINI_API_KEY"),
    ).toBeInTheDocument();
  });

  it("shows no banner when the provider is not authenticated", () => {
    acpAuthStatusMock.mockReturnValue({
      status: "unauthenticated",
      isChecking: false,
      isSupported: true,
    });
    renderStep("claude-code");

    expect(
      screen.queryByTestId("onboarding-acp-auth-detected"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("onboarding-acp-auth-checking"),
    ).not.toBeInTheDocument();
  });
});
