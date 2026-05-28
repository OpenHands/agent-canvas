import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_SERVER_CONFIG_STORAGE_KEY,
  saveAgentServerConfig,
} from "#/api/agent-server-config";
import { BACKENDS_STORAGE_KEY } from "#/api/backend-registry/storage";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import ApiKeyEntryScreen from "#/components/features/backends/api-key-entry-screen";

// ── Mocks ────────────────────────────────────────────────────────────

const getSettingsMock = vi.fn();

vi.mock("@openhands/typescript-client/clients", () => ({
  SettingsClient: vi.fn(function SettingsClientMock() {
    return { getSettings: getSettingsMock };
  }),
  // ServerClient needed by useBackendsHealth (imported transitively)
  ServerClient: vi.fn(function ServerClientMock() {
    return { getServerInfo: vi.fn().mockResolvedValue({ version: "1.0.0" }) };
  }),
}));

// Stub cloud org service used by ActiveBackendProvider
vi.mock("#/api/cloud/organization-service.api", () => ({
  getCurrentCloudApiKey: vi.fn().mockResolvedValue({
    orgId: null,
    isLegacyKey: true,
  }),
}));

// Capture reload calls without crashing jsdom
const reloadMock = vi.fn();

// ── Helpers ──────────────────────────────────────────────────────────

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>
        <ApiKeyEntryScreen />
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

/** Fill the api key — the only required field. */
async function fillApiKey(
  user: ReturnType<typeof userEvent.setup>,
  apiKey = "some-key",
) {
  await user.type(screen.getByTestId("api-key-entry-api-key"), apiKey);
}

// ── Setup / teardown ─────────────────────────────────────────────────

const ORIGINAL_LOCATION = window.location;

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  getSettingsMock.mockReset();

  // Replace window.location with a spy-able version
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...ORIGINAL_LOCATION,
      origin: "http://localhost:8000",
      hostname: "localhost",
      reload: reloadMock,
    },
  });
  reloadMock.mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.unstubAllEnvs();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
});

// ── Tests ────────────────────────────────────────────────────────────

describe("ApiKeyEntryScreen", () => {
  // @spec — UI: host (disabled) + api key + connect — name auto-generated
  it("renders host (disabled), api key, and connect button (no name field)", () => {
    renderScreen();

    // No name field — name is auto-generated from hostname
    expect(screen.queryByTestId("api-key-entry-name")).not.toBeInTheDocument();

    // Host field — pre-filled from window.location.origin, disabled
    const hostInput = screen.getByTestId("api-key-entry-host");
    expect(hostInput).toBeInTheDocument();
    expect(hostInput).toBeDisabled();
    expect(hostInput).toHaveValue("http://localhost:8000");

    // API key field
    expect(screen.getByTestId("api-key-entry-api-key")).toBeInTheDocument();

    // Connect button
    expect(screen.getByTestId("api-key-entry-submit")).toBeInTheDocument();
  });

  // @spec — API key field always starts empty (stale key wipe)
  it("starts with an empty api key even when localStorage has a stale key", () => {
    // Seed localStorage with a stale key from a previous session
    saveAgentServerConfig({
      baseUrl: "http://localhost:8000",
      sessionApiKey: "old-stale-key-from-previous-session",
    });

    // Also seed the backend registry with the stale key
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "default-local",
          name: "Local",
          host: "http://localhost:8000",
          apiKey: "old-stale-key-from-previous-session",
          kind: "local",
        },
      ]),
    );

    renderScreen();

    expect(screen.getByTestId("api-key-entry-api-key")).toHaveValue("");
  });

  // @spec — Connect button requires api key
  it("disables Connect when api key is empty", async () => {
    renderScreen();
    const user = userEvent.setup();
    const submit = screen.getByTestId("api-key-entry-submit");

    // Empty key
    expect(submit).toBeDisabled();

    // Key filled → enabled
    await user.type(screen.getByTestId("api-key-entry-api-key"), "key");
    expect(submit).not.toBeDisabled();
  });

  // @spec — Valid key: validates against GET /api/settings, persists, reloads
  it("validates the key before persisting and reloading", async () => {
    getSettingsMock.mockResolvedValueOnce({ llm_model: "test" });

    renderScreen();
    const user = userEvent.setup();

    await fillApiKey(user, "correct-key");
    await user.click(screen.getByTestId("api-key-entry-submit"));

    await waitFor(() => {
      expect(getSettingsMock).toHaveBeenCalledTimes(1);
    });

    // Key persisted to agent-server-config storage
    const stored = JSON.parse(
      window.localStorage.getItem(AGENT_SERVER_CONFIG_STORAGE_KEY) ?? "{}",
    );
    expect(stored.sessionApiKey).toBe("correct-key");

    // Page reloaded
    expect(reloadMock).toHaveBeenCalled();
  });

  // @spec — 401 shows "Invalid API key", does NOT persist or reload
  it("shows 'Invalid API key' when the key is rejected with 401", async () => {
    getSettingsMock.mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), {
        name: "HttpError",
        status: 401,
      }),
    );

    renderScreen();
    const user = userEvent.setup();

    await fillApiKey(user, "wrong-key");
    await user.click(screen.getByTestId("api-key-entry-submit"));

    // Error status appears with "Invalid" text
    await waitFor(() => {
      expect(screen.getByTestId("api-key-entry-status")).toBeInTheDocument();
    });
    expect(screen.getByTestId("api-key-entry-status")).toHaveClass(
      "text-red-400",
    );
    expect(screen.getByTestId("api-key-entry-status").textContent).toContain(
      "AUTH$INVALID_KEY",
    );

    // Key NOT persisted
    expect(
      window.localStorage.getItem(AGENT_SERVER_CONFIG_STORAGE_KEY),
    ).toBeNull();

    // Page NOT reloaded
    expect(reloadMock).not.toHaveBeenCalled();
  });

  // @spec — Non-401 errors show the actual error message, not "Invalid key"
  it("shows 'Connection failed' with detail for non-auth errors (e.g. 500)", async () => {
    getSettingsMock.mockRejectedValueOnce(
      Object.assign(new Error("HTTP 500: Internal Server Error"), {
        name: "HttpError",
        status: 500,
      }),
    );

    renderScreen();
    const user = userEvent.setup();

    await fillApiKey(user, "correct-key");
    await user.click(screen.getByTestId("api-key-entry-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("api-key-entry-status")).toBeInTheDocument();
    });

    const statusText =
      screen.getByTestId("api-key-entry-status").textContent ?? "";
    // Shows "Connection failed" prefix, NOT "Invalid API key"
    expect(statusText).toContain("AUTH$CONNECTION_FAILED");
    expect(statusText).toContain("500");
    expect(statusText).not.toContain("AUTH$INVALID_KEY");

    // Key NOT persisted
    expect(
      window.localStorage.getItem(AGENT_SERVER_CONFIG_STORAGE_KEY),
    ).toBeNull();

    expect(reloadMock).not.toHaveBeenCalled();
  });

  // @spec — Retry flow: wrong key → error → correct key → success
  it("allows retry after a failed attempt", async () => {
    getSettingsMock
      .mockRejectedValueOnce(
        Object.assign(new Error("Unauthorized"), {
          name: "HttpError",
          status: 401,
        }),
      )
      .mockResolvedValueOnce({ llm_model: "test" });

    renderScreen();
    const user = userEvent.setup();
    const apiKeyInput = screen.getByTestId("api-key-entry-api-key");

    // First attempt — wrong key
    await fillApiKey(user, "wrong-key");
    await user.click(screen.getByTestId("api-key-entry-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("api-key-entry-status")).toHaveClass(
        "text-red-400",
      );
    });

    // Retry — correct key
    await user.clear(apiKeyInput);
    await user.type(apiKeyInput, "correct-key");
    await user.click(screen.getByTestId("api-key-entry-submit"));

    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalled();
    });

    const stored = JSON.parse(
      window.localStorage.getItem(AGENT_SERVER_CONFIG_STORAGE_KEY) ?? "{}",
    );
    expect(stored.sessionApiKey).toBe("correct-key");
  });

  // @spec — Stale key in localStorage does not contaminate the new key
  it("persists only the freshly-entered key, not the stale one", async () => {
    // Seed a stale key from a previous session
    saveAgentServerConfig({
      baseUrl: "http://localhost:8000",
      sessionApiKey: "stale-key-AAAA",
    });

    getSettingsMock.mockResolvedValueOnce({ llm_model: "test" });

    renderScreen();
    const user = userEvent.setup();

    // API key field is empty — stale key not visible
    const apiKeyInput = screen.getByTestId("api-key-entry-api-key");
    expect(apiKeyInput).toHaveValue("");

    // Enter fresh key
    await fillApiKey(user, "fresh-key-BBBB");
    await user.click(screen.getByTestId("api-key-entry-submit"));

    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalled();
    });

    // Stored key is the NEW one, not old + new concatenated
    const stored = JSON.parse(
      window.localStorage.getItem(AGENT_SERVER_CONFIG_STORAGE_KEY) ?? "{}",
    );
    expect(stored.sessionApiKey).toBe("fresh-key-BBBB");
  });
});
