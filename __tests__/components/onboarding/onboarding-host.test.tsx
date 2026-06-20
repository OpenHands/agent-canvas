import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingHost } from "#/components/features/onboarding/onboarding-host";
import { ONBOARDING_COMPLETED_STORAGE_KEY } from "#/components/features/onboarding/use-onboarding-completion";
import SettingsService from "#/api/settings-service/settings-service.api";
import { DEFAULT_SETTINGS } from "#/services/settings";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { NavigationProvider } from "#/context/navigation-context";

// We don't need to exercise the modal's internals here; just verify
// whether OnboardingHost mounts it at all.
vi.mock("#/components/features/onboarding/onboarding-modal", () => ({
  OnboardingModal: () => (
    <div data-testid="onboarding-modal-stub">onboarding modal</div>
  ),
}));

function renderHost() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const navigationValue = {
    currentPath: "/",
    conversationId: null,
    isNavigating: false,
    navigate: vi.fn(),
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <ActiveBackendProvider>
          <NavigationProvider value={navigationValue}>
            <OnboardingHost />
          </NavigationProvider>
        </ActiveBackendProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function seedCloudBackend() {
  const backend = {
    id: "cloud-backend",
    name: "OpenHands Cloud",
    host: "https://app.all-hands.dev",
    apiKey: "cloud-session-key",
    kind: "cloud" as const,
  };
  setRegisteredBackends([backend]);
  setActiveSelection({ backendId: backend.id, orgId: null });
  return backend;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubEnv("VITE_BACKEND_BASE_URL", "http://localhost:9000");
  vi.stubEnv("VITE_SESSION_API_KEY", "session-key");
  __resetActiveStoreForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
  __resetActiveStoreForTests();
});

describe("OnboardingHost", () => {
  it("renders the onboarding modal for a fresh install with no configured LLM", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
      ...DEFAULT_SETTINGS,
      llm_api_key_set: false,
      agent_settings: {
        ...DEFAULT_SETTINGS.agent_settings,
        llm: { model: "" },
      },
    });

    renderHost();

    expect(
      await screen.findByTestId("onboarding-modal-stub"),
    ).toBeInTheDocument();
  });

  it("skips the modal and marks completion for a returning Cloud user with a configured LLM", async () => {
    seedCloudBackend();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
      ...DEFAULT_SETTINGS,
      llm_api_key_set: true,
      agent_settings: {
        ...DEFAULT_SETTINGS.agent_settings,
        llm: { model: "anthropic/claude-sonnet-4-5", api_key: "stored" },
      },
    });

    renderHost();

    await waitFor(() => {
      expect(
        window.localStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY),
      ).not.toBeNull();
    });
    expect(screen.queryByTestId("onboarding-modal-stub")).toBeNull();
  });

  it("skips the modal when the active Cloud LLM uses subscription auth (no API key)", async () => {
    seedCloudBackend();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
      ...DEFAULT_SETTINGS,
      llm_api_key_set: false,
      agent_settings: {
        ...DEFAULT_SETTINGS.agent_settings,
        llm: { model: "openai/gpt-5.5", auth_type: "subscription" },
      },
    });

    renderHost();

    await waitFor(() => {
      expect(
        window.localStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY),
      ).not.toBeNull();
    });
    expect(screen.queryByTestId("onboarding-modal-stub")).toBeNull();
  });

  it("still shows the modal for a Cloud user when an API key is set but no model is configured", async () => {
    seedCloudBackend();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
      ...DEFAULT_SETTINGS,
      llm_api_key_set: true,
      agent_settings: {
        ...DEFAULT_SETTINGS.agent_settings,
        llm: { model: "" },
      },
    });

    renderHost();

    expect(
      await screen.findByTestId("onboarding-modal-stub"),
    ).toBeInTheDocument();
    expect(
      window.localStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY),
    ).toBeNull();
  });

  it("does not skip onboarding for a Local backend even if the agent-server reports a key + model", async () => {
    // Local agent-servers can be started with an env-injected key
    // (`LLM_API_KEY=…`), so a settings-based "ready" signal is
    // unreliable for Local. Local first-run detection stays driven by
    // the existing localStorage flag.
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
      ...DEFAULT_SETTINGS,
      llm_api_key_set: true,
      agent_settings: {
        ...DEFAULT_SETTINGS.agent_settings,
        llm: { model: "openai/gpt-5.5", api_key: "stored" },
      },
    });

    renderHost();

    expect(
      await screen.findByTestId("onboarding-modal-stub"),
    ).toBeInTheDocument();
    expect(
      window.localStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY),
    ).toBeNull();
  });
});
