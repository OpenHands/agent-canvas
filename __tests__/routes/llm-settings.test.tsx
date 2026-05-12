import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LlmSettingsScreen from "#/routes/llm-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import ProfilesService from "#/api/profiles-service/profiles-service.api";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { Settings } from "#/types/settings";
import type { ResolvedActiveBackend } from "#/api/backend-registry/types";

// Mock useActiveBackend hook
const mockUseActiveBackend = vi.fn<() => ResolvedActiveBackend>();

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => mockUseActiveBackend(),
}));

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

const createLocalBackend = (): ResolvedActiveBackend => ({
  backend: {
    id: "local-1",
    kind: "local",
    name: "Local Backend",
    host: "http://localhost:18000",
    apiKey: "test-key",
  },
  orgId: null,
});

const createCloudBackend = (): ResolvedActiveBackend => ({
  backend: {
    id: "cloud-1",
    kind: "cloud",
    name: "Cloud Backend",
    host: "https://api.all-hands.dev",
    apiKey: "",
  },
  orgId: "org-1",
});

function renderLlmSettingsScreen() {
  return render(<LlmSettingsScreen />, {
    wrapper: ({ children }) => (
      <MemoryRouter>
        <QueryClientProvider
          client={new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })}
        >
          {children}
        </QueryClientProvider>
      </MemoryRouter>
    ),
  });
}

describe("LlmSettingsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default to local backend for most tests
    mockUseActiveBackend.mockReturnValue(createLocalBackend());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the profiles list view by default", async () => {
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
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({ profiles: [], active_profile: null });

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-settings-screen");

    // The profiles list view should be shown by default
    expect(screen.getByTestId("add-llm-profile")).toBeInTheDocument();
    // Settings form should NOT be visible by default
    expect(screen.queryByTestId("llm-provider-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("llm-api-key-input")).not.toBeInTheDocument();
  });

  it("shows the settings form when Add LLM Profile is clicked", async () => {
    const user = userEvent.setup();
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
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({ profiles: [], active_profile: null });

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-settings-screen");

    // Click Add LLM Profile button
    await user.click(screen.getByTestId("add-llm-profile"));

    // Now the settings form should be visible
    await waitFor(() => {
      expect(screen.getByTestId("llm-profile-form")).toBeInTheDocument();
    });
  });

  it("shows profiles in the list view", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        llm_api_key_set: true,
      }),
    );
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({
      profiles: [
        { name: "my_profile", model: "openai/gpt-4o", base_url: null, api_key_set: true },
        { name: "other_profile", model: "anthropic/claude-3", base_url: null, api_key_set: true },
      ],
      active_profile: "my_profile",
    });

    renderLlmSettingsScreen();

    // Wait for screen and profiles to load
    await screen.findByTestId("llm-settings-screen");
    
    // Verify profiles are rendered
    await waitFor(() => {
      const rows = screen.getAllByTestId("profile-list-row");
      expect(rows).toHaveLength(2);
    });

    // Verify profile names and models are displayed
    expect(screen.getByText("my_profile")).toBeInTheDocument();
    expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("other_profile")).toBeInTheDocument();
    expect(screen.getByText("anthropic/claude-3")).toBeInTheDocument();
  });

  it("shows empty profile name when adding a new profile", async () => {
    const user = userEvent.setup();
    
    // Settings have existing LLM configuration
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        llm_api_key_set: true,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "openai/gpt-4o",
            api_key: null,
            base_url: "https://api.openai.com/v1",
          },
        },
      }),
    );
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({ 
      profiles: [], 
      active_profile: null 
    });

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-settings-screen");

    // Click Add LLM Profile button
    await user.click(screen.getByTestId("add-llm-profile"));

    // Wait for the form to appear
    await waitFor(() => {
      expect(screen.getByTestId("llm-profile-form")).toBeInTheDocument();
    });

    // The profile name input should be empty (not pre-filled)
    const profileNameInput = screen.getByTestId("llm-profile-name-input");
    expect(profileNameInput).toHaveValue("");

    // API key should also be empty (form starts blank)
    const apiKeyInput = screen.getByTestId("llm-api-key-input");
    expect(apiKeyInput).toHaveValue("");
  });

  it("shows populated profile name when editing an existing profile", async () => {
    const user = userEvent.setup();
    
    // Settings have existing LLM configuration
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        llm_api_key_set: true,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "openai/gpt-4o",
            api_key: null,
            base_url: "https://api.openai.com/v1",
          },
        },
      }),
    );
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({ 
      profiles: [
        { name: "my_profile", model: "openai/gpt-4o", base_url: null, api_key_set: true },
      ], 
      active_profile: "my_profile" 
    });

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-settings-screen");

    // Wait for profiles to load
    await waitFor(() => {
      expect(screen.getByTestId("profile-list-row")).toBeInTheDocument();
    });

    // Click the menu button on the profile row
    const profileRow = screen.getByTestId("profile-list-row");
    const menuButton = within(profileRow).getByTestId("profile-menu-trigger");
    await user.click(menuButton);

    // Click Edit in the menu
    const editButton = await screen.findByTestId("profile-action-edit");
    await user.click(editButton);

    // Wait for the form to appear
    await waitFor(() => {
      expect(screen.getByTestId("llm-profile-form")).toBeInTheDocument();
    });

    // The profile name input should have the profile name
    const profileNameInput = screen.getByTestId("llm-profile-name-input");
    expect(profileNameInput).toHaveValue("my_profile");
  });

  it("returns to profiles list when cancel is clicked", async () => {
    const user = userEvent.setup();
    
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        llm_api_key_set: true,
      }),
    );
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({ 
      profiles: [], 
      active_profile: null 
    });

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-settings-screen");

    // Click Add LLM Profile button
    await user.click(screen.getByTestId("add-llm-profile"));

    // Wait for the form to appear
    await waitFor(() => {
      expect(screen.getByTestId("llm-profile-form")).toBeInTheDocument();
    });

    // Click Cancel
    await user.click(screen.getByTestId("cancel-profile-edit"));

    // Should be back to profiles list
    await waitFor(() => {
      expect(screen.getByTestId("add-llm-profile")).toBeInTheDocument();
      expect(screen.queryByTestId("llm-profile-form")).not.toBeInTheDocument();
    });
  });

  it("preserves form values when changing profile name", async () => {
    const user = userEvent.setup();
    
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
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({ 
      profiles: [], 
      active_profile: null 
    });

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-settings-screen");

    // Click Add LLM Profile button
    await user.click(screen.getByTestId("add-llm-profile"));

    // Wait for the form to appear
    await waitFor(() => {
      expect(screen.getByTestId("llm-profile-form")).toBeInTheDocument();
    });

    // Find the API key input and type a value
    const apiKeyInput = screen.getByTestId("llm-api-key-input");
    await user.type(apiKeyInput, "sk-test-api-key");
    
    // Verify the value was entered
    expect(apiKeyInput).toHaveValue("sk-test-api-key");

    // Now change the profile name
    const profileNameInput = screen.getByTestId("llm-profile-name-input");
    await user.type(profileNameInput, "my_custom_profile");

    // Verify profile name was entered
    expect(profileNameInput).toHaveValue("my_custom_profile");

    // CRITICAL: The API key should still have its value after changing profile name
    // This was a bug where changing profile name would wipe out other form values
    expect(apiKeyInput).toHaveValue("sk-test-api-key");
  });

  it("preserves form values when changing profile name after selecting model", async () => {
    const user = userEvent.setup();
    
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "",
        llm_api_key_set: false,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "",
            api_key: null,
            base_url: "",
          },
        },
      }),
    );
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({ 
      profiles: [], 
      active_profile: null 
    });

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-settings-screen");

    // Click Add LLM Profile button
    await user.click(screen.getByTestId("add-llm-profile"));

    // Wait for the form to appear
    await waitFor(() => {
      expect(screen.getByTestId("llm-profile-form")).toBeInTheDocument();
    });

    // Find the API key input and type a value first
    const apiKeyInput = screen.getByTestId("llm-api-key-input");
    await user.type(apiKeyInput, "sk-another-api-key");
    expect(apiKeyInput).toHaveValue("sk-another-api-key");

    // Type in the profile name field
    const profileNameInput = screen.getByTestId("llm-profile-name-input");
    await user.clear(profileNameInput);
    await user.type(profileNameInput, "test_profile");
    expect(profileNameInput).toHaveValue("test_profile");

    // API key should STILL have its value
    expect(apiKeyInput).toHaveValue("sk-another-api-key");

    // Now clear and type a different profile name
    await user.clear(profileNameInput);
    await user.type(profileNameInput, "different_name");
    expect(profileNameInput).toHaveValue("different_name");

    // API key should STILL be preserved
    expect(apiKeyInput).toHaveValue("sk-another-api-key");
  });

  describe("Cloud vs Local mode", () => {
    it("renders profiles list view in local mode", async () => {
      mockUseActiveBackend.mockReturnValue(createLocalBackend());
      
      vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
        buildSettings({
          llm_model: "openai/gpt-4o",
          llm_api_key_set: true,
        }),
      );
      vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({ 
        profiles: [], 
        active_profile: null 
      });

      renderLlmSettingsScreen();

      await screen.findByTestId("llm-settings-screen");

      // In local mode, should show the profiles list view with Add Profile button
      expect(screen.getByTestId("add-llm-profile")).toBeInTheDocument();
      // Should NOT show the direct settings form elements
      expect(screen.queryByTestId("llm-settings-form-basic")).not.toBeInTheDocument();
      expect(screen.queryByTestId("llm-settings-form-advanced")).not.toBeInTheDocument();
    });

    it("renders simple form view in cloud mode (no profiles)", async () => {
      mockUseActiveBackend.mockReturnValue(createCloudBackend());
      
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

      // In cloud mode, should show the simple form view (not profiles)
      // Cloud mode should NOT have the profiles list or add button
      expect(screen.queryByTestId("add-llm-profile")).not.toBeInTheDocument();
      expect(screen.queryByTestId("llm-profiles-list")).not.toBeInTheDocument();
      
      // Should show the direct settings form elements
      await waitFor(() => {
        expect(
          screen.queryByTestId("llm-settings-form-basic") || 
          screen.queryByTestId("llm-settings-form-advanced")
        ).toBeInTheDocument();
      });
    });

    it("shows model selector in cloud mode basic view", async () => {
      mockUseActiveBackend.mockReturnValue(createCloudBackend());
      
      vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
        buildSettings({
          llm_model: "openai/gpt-4o",
          llm_api_key_set: true,
          agent_settings: {
            ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
            llm: {
              model: "openai/gpt-4o",
              api_key: null,
              base_url: "", // No custom base URL = basic view
            },
          },
        }),
      );

      renderLlmSettingsScreen();

      await screen.findByTestId("llm-settings-screen");

      // In cloud mode basic view, should show model selector and API key input
      await waitFor(() => {
        expect(screen.getByTestId("llm-settings-form-basic")).toBeInTheDocument();
      });
      
      // Should have API key input
      expect(screen.getByTestId("llm-api-key-input")).toBeInTheDocument();
    });

    it("shows custom model input in cloud mode advanced view", async () => {
      mockUseActiveBackend.mockReturnValue(createCloudBackend());
      
      vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
        buildSettings({
          llm_model: "openai/gpt-4o",
          llm_api_key_set: true,
          llm_base_url: "https://custom-api.example.com", // Custom base URL = advanced view
          agent_settings: {
            ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
            llm: {
              model: "openai/gpt-4o",
              api_key: null,
              base_url: "https://custom-api.example.com",
            },
          },
        }),
      );

      renderLlmSettingsScreen();

      await screen.findByTestId("llm-settings-screen");

      // In cloud mode advanced view, should show custom model input
      await waitFor(() => {
        expect(screen.getByTestId("llm-settings-form-advanced")).toBeInTheDocument();
      });
      
      // Should have custom model input and base URL input
      expect(screen.getByTestId("llm-custom-model-input")).toBeInTheDocument();
      expect(screen.getByTestId("base-url-input")).toBeInTheDocument();
    });

    it("does NOT show profile name input in cloud mode", async () => {
      mockUseActiveBackend.mockReturnValue(createCloudBackend());
      
      vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
        buildSettings({
          llm_model: "openai/gpt-4o",
          llm_api_key_set: true,
        }),
      );

      renderLlmSettingsScreen();

      await screen.findByTestId("llm-settings-screen");

      // In cloud mode, should NOT have profile name input
      expect(screen.queryByTestId("llm-profile-name-input")).not.toBeInTheDocument();
    });

    it("shows profile name input in local mode when adding profile", async () => {
      const user = userEvent.setup();
      mockUseActiveBackend.mockReturnValue(createLocalBackend());
      
      vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
        buildSettings({
          llm_model: "openai/gpt-4o",
          llm_api_key_set: true,
        }),
      );
      vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({ 
        profiles: [], 
        active_profile: null 
      });

      renderLlmSettingsScreen();

      await screen.findByTestId("llm-settings-screen");

      // Click Add LLM Profile button
      await user.click(screen.getByTestId("add-llm-profile"));

      // Wait for the form to appear
      await waitFor(() => {
        expect(screen.getByTestId("llm-profile-form")).toBeInTheDocument();
      });

      // In local mode profile form, should have profile name input
      expect(screen.getByTestId("llm-profile-name-input")).toBeInTheDocument();
    });
  });
});