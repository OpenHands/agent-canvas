import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsService from "#/api/settings-service/settings-service.api";
import OptionService from "#/api/option-service/option-service.api";
import ProfilesService from "#/api/profiles-service/profiles-service.api";
import {
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { DEFAULT_SETTINGS } from "#/services/settings";
import { useLlmConfigured } from "./use-llm-configured";

vi.mock("#/api/settings-service/settings-service.api", () => ({
  default: {
    getSettings: vi.fn(),
  },
}));

vi.mock("#/api/option-service/option-service.api", () => ({
  default: {
    getConfig: vi.fn(),
  },
}));

vi.mock("#/api/profiles-service/profiles-service.api", () => ({
  default: {
    listProfiles: vi.fn(),
    getProfile: vi.fn(),
  },
}));

const localBackend: Backend = {
  id: "test-local",
  name: "Test Local",
  host: "http://localhost:8001",
  apiKey: "test-key",
  kind: "local",
};

function renderLlmConfiguredHook() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>{children}</ActiveBackendProvider>
    </QueryClientProvider>
  );

  return renderHook(() => useLlmConfigured(), { wrapper });
}

describe("useLlmConfigured", () => {
  const mockGetSettings = vi.mocked(SettingsService.getSettings);
  const mockGetConfig = vi.mocked(OptionService.getConfig);
  const mockListProfiles = vi.mocked(ProfilesService.listProfiles);
  const mockGetProfile = vi.mocked(ProfilesService.getProfile);

  beforeEach(() => {
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });

    mockGetSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      llm_api_key_set: false,
      agent_settings: {
        ...(DEFAULT_SETTINGS.agent_settings ?? {}),
        agent_kind: "openhands",
        llm: {
          model: "openai/gpt-5.5",
          auth_type: "subscription",
          subscription_vendor: "openai",
        },
      },
    });
    mockGetConfig.mockResolvedValue({
      feature_flags: { hide_llm_settings: false },
    } as Awaited<ReturnType<typeof OptionService.getConfig>>);
  });

  afterEach(() => {
    vi.clearAllMocks();
    setActiveSelection(null);
    setRegisteredBackends([]);
  });

  it("treats an active subscription LLM profile without an API key as configured", async () => {
    mockListProfiles.mockResolvedValue({
      active_profile: "gpt-5.5-sub",
      profiles: [
        {
          name: "gpt-5.5-sub",
          model: "gpt-5.5",
          base_url: "https://chatgpt.com/backend-api/codex",
          api_key_set: false,
        },
      ],
    });
    mockGetProfile.mockResolvedValue({
      name: "gpt-5.5-sub",
      api_key_set: false,
      config: {
        model: "openai/gpt-5.5",
        auth_type: "subscription",
        subscription_vendor: "openai",
      },
    });

    const { result } = renderLlmConfiguredHook();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isConfigured).toBe(true);
    expect(mockGetProfile).toHaveBeenCalledWith("gpt-5.5-sub");
  });
});
