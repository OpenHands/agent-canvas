import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoutesStub } from "react-router";
import SettingsScreen, { clientLoader } from "#/routes/settings";
import OptionService from "#/api/option-service/option-service.api";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { getFirstAvailablePath } from "#/utils/settings-utils";
import { OSS_NAV_ITEMS } from "#/constants/settings-nav";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

vi.mock("#/hooks/use-settings-nav-items", () => ({
  useSettingsNavItems: () => [
    { type: "item", item: OSS_NAV_ITEMS[0] },
    { type: "item", item: OSS_NAV_ITEMS[6] },
  ],
}));

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

describe("settings route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    __resetActiveStoreForTests();
  });

  afterEach(() => {
    window.localStorage.clear();
    __resetActiveStoreForTests();
  });

  it("prefers OSS fallback routes only", () => {
    expect(
      getFirstAvailablePath({
        hide_llm_settings: true,
        enable_jira: false,
        enable_jira_dc: false,
        enable_linear: false,
        hide_users_page: true,
        hide_integrations_page: false,
      }),
    ).toBe("/settings/mcp");
  });

  it("redirects hidden OSS settings pages to the first available route", async () => {
    vi.spyOn(OptionService, "getConfig").mockResolvedValue({
      posthog_client_key: null,
      feature_flags: {
        hide_llm_settings: true,
        enable_jira: false,
        enable_jira_dc: false,
        enable_linear: false,
        hide_users_page: true,
        hide_integrations_page: false,
      },
      providers_configured: [],
      maintenance_start_time: null,
      recaptcha_site_key: null,
      faulty_models: [],
      error_message: null,
      updated_at: new Date().toISOString(),
    });

    const response = (await clientLoader({
      request: new Request("http://localhost/settings"),
      params: {},
      context: {},
    } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/settings/mcp");
  });

  it("redirects local-only settings paths to /settings when the active backend is cloud", async () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });
    const getConfigSpy = vi.spyOn(OptionService, "getConfig");

    const integrationsResponse = (await clientLoader({
      request: new Request("http://localhost/settings/integrations"),
      params: {},
      context: {},
    } as never)) as Response;

    expect(integrationsResponse.status).toBe(302);
    expect(integrationsResponse.headers.get("Location")).toBe("/settings");
    expect(getConfigSpy).not.toHaveBeenCalled();
  });

  it("renders the current OSS section title", () => {
    const RouterStub = createRoutesStub([
      {
        path: "/settings",
        Component: SettingsScreen,
        children: [
          {
            path: "/settings/app",
            Component: () => <div data-testid="app-settings-screen" />,
          },
        ],
      },
    ]);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ActiveBackendProvider>
          <RouterStub initialEntries={["/settings/app"]} />
        </ActiveBackendProvider>
      </QueryClientProvider>,
    );

    expect(
      screen.getAllByText("SETTINGS$NAV_APPLICATION").length,
    ).toBeGreaterThan(0);
    expect(screen.getByTestId("app-settings-screen")).toBeInTheDocument();
  });
});
