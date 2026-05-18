import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "#/mocks/node";
// Import the named export LlmSettingsScreen directly for testing the form component.
// The default export now renders LlmSettingsLocalView (the profiles manager view).
import LlmSettingsRoute, { LlmSettingsScreen } from "#/routes/llm-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { Settings } from "#/types/settings";
import * as activeBackendContext from "#/contexts/active-backend-context";
import type { Backend } from "#/api/backend-registry/types";
import {
  __resetActiveStoreForTests,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { DEFAULT_OPENHANDS_CLOUD_HOST } from "#/utils/constants";

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

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

function renderLlmSettingsScreen() {
  return render(<LlmSettingsScreen />, {
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
  host: DEFAULT_OPENHANDS_CLOUD_HOST,
  apiKey: "test-key",
  kind: "cloud",
};

interface StoredCloudBackendFixture {
  id: string;
  name: string;
  host: string;
  cloudApiKey: string;
}

function mockStoredCloudBackends(
  credentials: StoredCloudBackendFixture[] = [],
) {
  setRegisteredBackends(
    credentials.map((credential) => ({
      id: credential.id,
      name: credential.name,
      host: credential.host,
      kind: "cloud" as const,
      apiKey: credential.cloudApiKey,
    })),
  );
}

function mockCloudProxy({
  lmApiKey = null,
  lmStatus = 200,
  authorize = true,
  token = "cloud-api-key",
}: {
  lmApiKey?: string | null;
  lmStatus?: number;
  authorize?: boolean;
  token?: string;
} = {}) {
  const requests: Array<{ path?: string; headers?: Record<string, string> }> =
    [];
  server.use(
    http.post("*/api/cloud-proxy", async ({ request }) => {
      const body = (await request.json()) as {
        path?: string;
        headers?: Record<string, string>;
      };
      requests.push(body);

      if (body.path === "/api/keys/llm/byor") {
        if (lmStatus >= 400) {
          return HttpResponse.json(
            { error: "cloud unavailable" },
            { status: lmStatus },
          );
        }
        return HttpResponse.json(lmApiKey ? { key: lmApiKey } : {});
      }

      if (body.path === "/oauth/device/authorize" && authorize) {
        return HttpResponse.json({
          device_code: "device-code",
          user_code: "USER-CODE",
          verification_uri: "https://app.all-hands.dev/device",
          verification_uri_complete:
            "https://app.all-hands.dev/device?user_code=USER-CODE",
          expires_in: 600,
          interval: 1,
        });
      }

      if (body.path === "/oauth/device/token" && authorize) {
        return HttpResponse.json({
          access_token: token,
          token_type: "Bearer",
        });
      }

      return HttpResponse.json({ error: "unexpected path" }, { status: 500 });
    }),
  );
  return requests;
}

describe("LlmSettingsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    window.localStorage.clear();
    __resetActiveStoreForTests();
    mockStoredCloudBackends();
    mockCloudProxy();
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

  it("uses an existing OpenHands Cloud login to fetch a distinct LM API key", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openhands/claude-opus-4-5-20251101",
        llm_api_key_set: false,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "openhands/claude-opus-4-5-20251101",
            api_key: null,
            base_url: "",
          },
        },
      }),
    );
    mockStoredCloudBackends([
      {
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        cloudApiKey: "cloud-api-key",
      },
    ]);
    const proxyRequests = mockCloudProxy({ lmApiKey: "  lm-api-key  " });

    renderLlmSettingsScreen();

    await screen.findByTestId("llm-api-key-input-cloud-login-detected");
    expect(
      screen.queryByTestId("llm-api-key-input-cloud-auth-select"),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByTestId("llm-api-key-input-get-openhands-lm-key"),
    );

    expect(proxyRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/api/keys/llm/byor",
          headers: expect.objectContaining({
            Authorization: "Bearer cloud-api-key",
          }),
        }),
      ]),
    );
    expect(screen.getByTestId("llm-api-key-input")).toHaveValue("lm-api-key");
  });

  it("recovers when fetching an OpenHands-provided LM API key throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openhands/claude-opus-4-5-20251101",
        llm_api_key_set: false,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "openhands/claude-opus-4-5-20251101",
            api_key: null,
            base_url: "",
          },
        },
      }),
    );
    mockStoredCloudBackends([
      {
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        cloudApiKey: "cloud-api-key",
      },
    ]);
    mockCloudProxy({ lmStatus: 503 });

    renderLlmSettingsScreen();

    const button = await screen.findByTestId(
      "llm-api-key-input-get-openhands-lm-key",
    );
    await userEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "SETTINGS$OPENHANDS_LM_API_KEY_FETCH_FAILED",
    );
    await waitFor(() => expect(button).toBeEnabled());
    expect(errorSpy).toHaveBeenCalled();
  });

  it("rejects an empty OpenHands-provided LM API key response", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openhands/claude-opus-4-5-20251101",
        llm_api_key_set: false,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "openhands/claude-opus-4-5-20251101",
            api_key: null,
            base_url: "",
          },
        },
      }),
    );
    mockStoredCloudBackends([
      {
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        cloudApiKey: "cloud-api-key",
      },
    ]);
    mockCloudProxy({ lmApiKey: "  " });

    renderLlmSettingsScreen();

    await userEvent.click(
      await screen.findByTestId("llm-api-key-input-get-openhands-lm-key"),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "SETTINGS$OPENHANDS_LM_API_KEY_FETCH_FAILED",
    );
    expect(screen.getByTestId("llm-api-key-input")).toHaveValue("");
  });

  it("logs in with device flow, persists the Cloud key, and applies the fetched LM API key", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openhands/claude-opus-4-5-20251101",
        llm_api_key_set: false,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "openhands/claude-opus-4-5-20251101",
            api_key: null,
            base_url: "",
          },
        },
      }),
    );
    const proxyRequests = mockCloudProxy({ lmApiKey: "lm-api-key" });
    vi.spyOn(window, "open").mockReturnValue({
      closed: false,
      close: vi.fn(),
      opener: {},
      location: { href: "" },
    } as unknown as Window);

    renderLlmSettingsScreen();

    await userEvent.click(
      await screen.findByTestId("llm-api-key-input-login-button"),
    );

    await waitFor(() => {
      expect(window.localStorage.getItem("openhands-backends")).toContain(
        "cloud-api-key",
      );
    });
    expect(proxyRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/oauth/device/authorize" }),
        expect.objectContaining({ path: "/oauth/device/token" }),
        expect.objectContaining({
          path: "/api/keys/llm/byor",
          headers: expect.objectContaining({
            Authorization: "Bearer cloud-api-key",
          }),
        }),
      ]),
    );
    expect(screen.getByTestId("llm-api-key-input")).toHaveValue("lm-api-key");
  });

  it("shows device-flow LM key fetch failures next to the login flow", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openhands/claude-opus-4-5-20251101",
        llm_api_key_set: false,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "openhands/claude-opus-4-5-20251101",
            api_key: null,
            base_url: "",
          },
        },
      }),
    );
    mockCloudProxy({ lmApiKey: null });
    vi.spyOn(window, "open").mockReturnValue({
      closed: false,
      close: vi.fn(),
      opener: {},
      location: { href: "" },
    } as unknown as Window);

    renderLlmSettingsScreen();

    await userEvent.click(
      await screen.findByTestId("llm-api-key-input-login-button"),
    );

    expect(
      await screen.findByTestId("llm-api-key-input-device-flow-lm-key-error"),
    ).toHaveTextContent("SETTINGS$OPENHANDS_LM_API_KEY_FETCH_FAILED");
  });

  it("requires selecting a Cloud backend before reusing credentials when multiple logins exist", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openhands/claude-opus-4-5-20251101",
        llm_api_key_set: false,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          llm: {
            model: "openhands/claude-opus-4-5-20251101",
            api_key: null,
            base_url: "",
          },
        },
      }),
    );
    const proxyRequests = mockCloudProxy({ lmApiKey: "lm-api-key" });
    mockStoredCloudBackends([
      {
        id: "cloud-a",
        name: "Cloud A",
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        cloudApiKey: "cloud-api-key-a",
      },
      {
        id: "cloud-b",
        name: "Cloud B",
        host: "https://self-hosted.example.com",
        cloudApiKey: "cloud-api-key-b",
      },
    ]);

    renderLlmSettingsScreen();

    const button = await screen.findByTestId(
      "llm-api-key-input-get-openhands-lm-key",
    );
    expect(button).toBeDisabled();

    await userEvent.selectOptions(
      screen.getByTestId("llm-api-key-input-cloud-auth-select"),
      "cloud-b",
    );
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(proxyRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          host: "https://self-hosted.example.com",
          path: "/api/keys/llm/byor",
          headers: expect.objectContaining({
            Authorization: "Bearer cloud-api-key-b",
          }),
        }),
      ]),
    );
    expect(screen.getByTestId("llm-api-key-input")).toHaveValue("lm-api-key");
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
