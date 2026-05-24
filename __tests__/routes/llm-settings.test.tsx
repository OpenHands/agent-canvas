import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Import the named export LlmSettingsScreen directly for testing the form component.
// The default export now renders LlmSettingsLocalView (the profiles manager view).
import LlmSettingsRoute, { LlmSettingsScreen } from "#/routes/llm-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { Settings } from "#/types/settings";
import * as activeBackendContext from "#/contexts/active-backend-context";
import type { Backend } from "#/api/backend-registry/types";
import * as useLlmProfilesHook from "#/hooks/query/use-llm-profiles";

vi.mock("#/hooks/query/use-llm-profiles");

function buildSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...MOCK_DEFAULT_USER_SETTINGS,
    ...overrides,
    agent_settings_schema:
      overrides.agent_settings_schema ??
      MOCK_DEFAULT_USER_SETTINGS.agent_settings_schema,
    agent_settings:
      overrides.agent_settings ?? MOCK_DEFAULT_USER_SETTINGS.agent_settings,
  };
}

function renderLlmSettingsScreen(
  props: Parameters<typeof LlmSettingsScreen>[0] = {},
) {
  return render(<LlmSettingsScreen {...props} />, {
    wrapper: ({ children }) => (
      <MemoryRouter>
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { retry: false } },
            })
          }
        >
          {children}
        </QueryClientProvider>
      </MemoryRouter>
    ),
  });
}

function renderLlmSettingsRoute() {
  return render(<LlmSettingsRoute />, {
    wrapper: ({ children }) => (
      <MemoryRouter>
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { retry: false } },
            })
          }
        >
          {children}
        </QueryClientProvider>
      </MemoryRouter>
    ),
  });
}

const mockLocalBackend: Backend = {
  id: "local-1",
  name: "Local Backend",
  host: "http://localhost:18000",
  apiKey: "",
  kind: "local",
};

const mockCloudBackend: Backend = {
  id: "cloud-1",
  name: "Cloud Backend",
  host: "https://app.all-hands.dev",
  apiKey: "test-key",
  kind: "cloud",
};

/**
 * Helper to create properly typed mock return values for useLlmProfiles.
 */
function createMockLlmProfilesReturn(
  overrides: Partial<ReturnType<typeof useLlmProfilesHook.useLlmProfiles>> = {},
): ReturnType<typeof useLlmProfilesHook.useLlmProfiles> {
  return {
    data: { profiles: [], active_profile: null },
    isLoading: false,
    error: null,
    isError: false,
    isFetching: false,
    isSuccess: true,
    refetch: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useLlmProfilesHook.useLlmProfiles>;
}

describe("LlmSettingsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the OSS LLM settings form from the SDK schema fallback", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        llm_api_key_set: true,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "openai/gpt-4o",
            api_key: null,
            base_url: "",
          },
        },
      }),
    );

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-settings-screen");

    expect(screen.getByTestId("llm-provider-input")).toBeInTheDocument();
    expect(screen.getByTestId("llm-api-key-input")).toBeInTheDocument();
  });

  it("shows the API key as set on the global settings page when a key exists", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ llm_model: "openai/gpt-4o", llm_api_key_set: true }),
    );

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-settings-screen");

    expect(screen.getByTestId("set-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("llm-api-key-input")).toHaveValue("");
  });

  it("does not show a 'key set' indicator for a brand-new embedded profile even when a global key exists (bug #640)", async () => {
    // A global key exists, but a fresh profile form must look unset so the user
    // knows they have to enter one — otherwise the profile saves with no key.
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ llm_model: "openai/gpt-4o", llm_api_key_set: true }),
    );

    renderLlmSettingsScreen({
      embedded: true,
      hideSaveButton: true,
      initialValueOverrides: {
        "llm.model": "",
        "llm.api_key": "",
        "llm.base_url": "",
      },
    });

    await screen.findByTestId("llm-settings-screen");

    expect(screen.getByTestId("llm-api-key-input")).toHaveValue("");
    expect(screen.queryByTestId("set-indicator")).not.toBeInTheDocument();
  });
});

describe("LlmSettingsRoute - backend mode rendering", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    // Default to local backend
    vi.spyOn(activeBackendContext, "useActiveBackend").mockReturnValue({
      backend: mockLocalBackend,
      orgId: null,
    });

    // Mock useLlmProfiles for local mode tests
    vi.mocked(useLlmProfilesHook.useLlmProfiles).mockReturnValue(
      createMockLlmProfilesReturn(),
    );
  });

  it("renders LlmSettingsLocalView (profile manager) for local backends", async () => {
    vi.spyOn(activeBackendContext, "useActiveBackend").mockReturnValue({
      backend: mockLocalBackend,
      orgId: null,
    });

    renderLlmSettingsRoute();

    // Local mode shows the "Add LLM Profile" button from LlmProfilesManager
    await screen.findByTestId("add-llm-profile");
    expect(screen.getByTestId("add-llm-profile")).toBeInTheDocument();
  });

  it("renders standard LlmSettingsScreen (no profiles) for cloud backends", async () => {
    vi.spyOn(activeBackendContext, "useActiveBackend").mockReturnValue({
      backend: mockCloudBackend,
      orgId: "org-123",
    });

    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        llm_api_key_set: true,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "openai/gpt-4o",
            api_key: null,
            base_url: "",
          },
        },
      }),
    );

    renderLlmSettingsRoute();

    // Cloud mode shows the standard LLM settings form (not profile manager)
    await screen.findByTestId("llm-settings-screen");
    expect(screen.getByTestId("llm-settings-screen")).toBeInTheDocument();

    // Should NOT show the "Add LLM Profile" button
    expect(screen.queryByTestId("add-llm-profile")).not.toBeInTheDocument();
  });
});
