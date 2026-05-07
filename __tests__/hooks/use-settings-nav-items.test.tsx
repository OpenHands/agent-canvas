import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OSS_NAV_ITEMS } from "#/constants/settings-nav";
import { useSettingsNavItems } from "#/hooks/use-settings-nav-items";
import { WebClientConfig } from "#/api/option-service/option.types";

const useConfigMock = vi.fn();
const useActiveBackendMock = vi.fn();

vi.mock("#/hooks/query/use-config", () => ({
  useConfig: () => useConfigMock(),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => useActiveBackendMock(),
}));

const localActive = {
  backend: {
    id: "__bundled__",
    name: "Local",
    host: "http://localhost",
    apiKey: "",
    kind: "local" as const,
  },
  orgId: null,
};

const cloudActive = {
  backend: {
    id: "prod",
    name: "Production",
    host: "https://app.all-hands.dev",
    apiKey: "bearer",
    kind: "cloud" as const,
  },
  orgId: null,
};

const createConfig = (
  feature_flags: Partial<WebClientConfig["feature_flags"]> = {},
): WebClientConfig => ({
  posthog_client_key: null,
  feature_flags: {
    hide_llm_settings: false,
    enable_jira: false,
    enable_jira_dc: false,
    enable_linear: false,
    hide_users_page: true,
    hide_integrations_page: false,
    ...feature_flags,
  },
  providers_configured: [],
  maintenance_start_time: null,
  recaptcha_site_key: null,
  faulty_models: [],
  error_message: null,
  updated_at: new Date().toISOString(),
});

describe("useSettingsNavItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActiveBackendMock.mockReturnValue(localActive);
  });

  it("returns the OSS settings items in order", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });

    const { result } = renderHook(() => useSettingsNavItems());

    expect(result.current).toEqual(
      OSS_NAV_ITEMS.map((item) => ({ type: "item", item })),
    );
  });

  it("filters hidden routes from the OSS settings items", () => {
    useConfigMock.mockReturnValue({
      data: createConfig({
        hide_llm_settings: true,
        hide_integrations_page: true,
      }),
    });

    const { result } = renderHook(() => useSettingsNavItems());
    const paths = result.current
      .filter((item) => item.type === "item")
      .map((item) => (item.type === "item" ? item.item.to : null));

    expect(paths).not.toContain("/settings");
    expect(paths).not.toContain("/settings/integrations");
    expect(paths).toContain("/settings/mcp");
    expect(paths).toContain("/settings/secrets");
  });

  it("hides local-only sub-pages when the active backend is cloud", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });
    useActiveBackendMock.mockReturnValue(cloudActive);

    const { result } = renderHook(() => useSettingsNavItems());
    const paths = result.current
      .filter((item) => item.type === "item")
      .map((item) => (item.type === "item" ? item.item.to : null));

    expect(paths).not.toContain("/settings/agent-server");
    expect(paths).not.toContain("/settings/integrations");
    expect(paths).toContain("/settings");
    expect(paths).toContain("/settings/condenser");
    expect(paths).toContain("/settings/verification");
    expect(paths).toContain("/settings/mcp");
    expect(paths).toContain("/settings/skills");
    expect(paths).toContain("/settings/secrets");
  });
});
