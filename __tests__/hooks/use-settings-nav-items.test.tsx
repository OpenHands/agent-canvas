import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OSS_NAV_ITEMS } from "#/constants/settings-nav";
import { useSettingsNavItems } from "#/hooks/use-settings-nav-items";
import { WebClientConfig } from "#/api/option-service/option.types";

const useConfigMock = vi.fn();
const useActiveBackendMock = vi.fn<
  () => { backend: { kind: "local" | "cloud" }; orgId: string | null }
>(() => ({
  backend: { kind: "local" },
  orgId: null,
}));

vi.mock("#/hooks/query/use-config", () => ({
  useConfig: () => useConfigMock(),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => useActiveBackendMock(),
}));

const createConfig = (
  feature_flags: Partial<WebClientConfig["feature_flags"]> = {},
): WebClientConfig => ({
  posthog_client_key: null,
  feature_flags: {
    hide_llm_settings: false,
    hide_users_page: true,
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
    useActiveBackendMock.mockReturnValue({
      backend: { kind: "local" },
      orgId: null,
    });
  });

  it("renames the LLM settings item to LLM profiles on local backends", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });

    const { result } = renderHook(() => useSettingsNavItems());
    const llmItem = result.current.find(
      (item) => item.type === "item" && item.item.to === "/settings",
    );

    expect(llmItem).toEqual({
      type: "item",
      item: {
        ...OSS_NAV_ITEMS[0],
        text: "SETTINGS$LLM_PROFILES",
        subtitle: "SETTINGS$PAGE_LLM_PROFILES_SUBLINE",
      },
    });
  });

  it("keeps the generic LLM settings item on cloud backends", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });
    useActiveBackendMock.mockReturnValue({
      backend: { kind: "cloud" },
      orgId: "org-123",
    });

    const { result } = renderHook(() => useSettingsNavItems());

    expect(result.current).toEqual(
      OSS_NAV_ITEMS.map((item) => ({ type: "item", item })),
    );
  });

  it("filters hidden routes from the OSS settings items", () => {
    useConfigMock.mockReturnValue({
      data: createConfig({ hide_llm_settings: true }),
    });

    const { result } = renderHook(() => useSettingsNavItems());
    const paths = result.current
      .filter((item) => item.type === "item")
      .map((item) => (item.type === "item" ? item.item.to : null));

    expect(paths).not.toContain("/settings");
    expect(paths).toContain("/settings/app");
    expect(paths).toContain("/settings/secrets");
  });

  it("never lists removed settings sub-pages", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });

    const { result } = renderHook(() => useSettingsNavItems());
    const paths = result.current
      .filter((item) => item.type === "item")
      .map((item) => (item.type === "item" ? item.item.to : null));

    expect(paths).not.toContain("/settings/agent-server");
    expect(paths).not.toContain("/settings/integrations");
    expect(paths).not.toContain("/settings/skills");
    expect(paths).not.toContain("/settings/mcp");
  });
});
