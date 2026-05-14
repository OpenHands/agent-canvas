import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoutesStub } from "react-router";
import SettingsScreen, { clientLoader } from "#/routes/settings";
import OptionService from "#/api/option-service/option-service.api";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { getFirstAvailablePath } from "#/utils/settings-utils";
import { OSS_NAV_ITEMS } from "#/constants/settings-nav";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

vi.mock("#/hooks/use-settings-nav-items", () => ({
  // Mirror the real navigation: LLM + Application (which the title test
  // navigates to via `/settings/app`).
  useSettingsNavItems: () =>
    OSS_NAV_ITEMS.filter((item) =>
      ["/settings", "/settings/app"].includes(item.to),
    ).map((item) => ({ type: "item", item })),
}));

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
        hide_users_page: true,
      }),
    ).toBe("/settings/app");
  });

  it("redirects hidden OSS settings pages to the first available route", async () => {
    vi.spyOn(OptionService, "getConfig").mockResolvedValue({
      posthog_client_key: null,
      feature_flags: {
        hide_llm_settings: true,
        hide_users_page: true,
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
    expect(response.headers.get("Location")).toBe("/settings/app");
  });

  it("does not redirect unrelated removed nested paths through the settings loader", async () => {
    vi.spyOn(OptionService, "getConfig").mockResolvedValue({
      posthog_client_key: null,
      feature_flags: {
        hide_llm_settings: false,
        hide_users_page: true,
      },
      providers_configured: [],
      maintenance_start_time: null,
      recaptcha_site_key: null,
      faulty_models: [],
      error_message: null,
      updated_at: new Date().toISOString(),
    });

    const result = await clientLoader({
      request: new Request("http://localhost/settings/integrations"),
      params: {},
      context: {},
    } as never);

    expect(result).toBeNull();
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
